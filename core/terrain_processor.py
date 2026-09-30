import os
import numpy as np
import rasterio
from rasterio.transform import from_origin
from typing import Tuple, Dict, Optional, List

DEFAULT_DEM_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jezero_dem_downsampled.tif")

class DEMProcessor:
    """Ingests and parses Mars Digital Elevation Models (DEMs) and computes slopes."""
    
    def __init__(self, dem_path: str = DEFAULT_DEM_PATH):
        self.dem_path = dem_path
        if not os.path.exists(self.dem_path):
            self.generate_synthetic_jezero_dem()
        
        self.dataset = rasterio.open(self.dem_path)
        self.elevation_grid = self.dataset.read(1)
        self.transform = self.dataset.transform
        self.bounds = self.dataset.bounds
        self.crs = self.dataset.crs
        self.height, self.width = self.elevation_grid.shape
        
        # Calculate cell resolution in meters (approx at Jezero latitude 18.44 deg N)
        # 1 deg lat ~= 59.26 km on Mars (Mars radius ~ 3389.5 km)
        # 1 deg lon at 18.44 deg N ~= 59.26 * cos(18.44 deg) ~= 56.22 km
        lat_res = abs(self.transform.e) * 59260.0 # meters per pixel lat
        lon_res = abs(self.transform.a) * 56220.0 # meters per pixel lon
        self.cell_size_m = float((lat_res + lon_res) / 2.0)
        
        # Compute slope grid in degrees
        self.slope_grid = self._compute_slope_grid(lat_res, lon_res)

    def _compute_slope_grid(self, lat_res: float, lon_res: float) -> np.ndarray:
        """Calculates 2D slope array in degrees using gradient vector components."""
        dy, dx = np.gradient(self.elevation_grid, lat_res, lon_res)
        slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
        return np.degrees(slope_rad)

    def latlon_to_rowcol(self, lat: float, lon: float) -> Tuple[int, int]:
        """Convert Latitude/Longitude to array (row, col) indices."""
        row, col = self.dataset.index(lon, lat)
        row = int(np.clip(row, 0, self.height - 1))
        col = int(np.clip(col, 0, self.width - 1))
        return row, col

    def rowcol_to_latlon(self, row: int, col: int) -> Tuple[float, float]:
        """Convert array (row, col) indices to Latitude/Longitude."""
        lon, lat = rasterio.transform.xy(self.transform, row, col, offset='center')
        return lat, lon

    def get_elevation(self, lat: float, lon: float) -> float:
        """Get elevation in meters at a given lat/lon."""
        r, c = self.latlon_to_rowcol(lat, lon)
        return float(self.elevation_grid[r, c])

    def get_slope(self, lat: float, lon: float) -> float:
        """Get slope in degrees at a given lat/lon."""
        r, c = self.latlon_to_rowcol(lat, lon)
        return float(self.slope_grid[r, c])

    def get_sub_grid(self, start_latlon: Tuple[float, float], end_latlon: Tuple[float, float], 
                     buffer_px: int = 15) -> Dict:
        """
        Extracts a focused spatial sub-grid around start and end points to 
        optimize graph construction and memory footprint.
        """
        r1, c1 = self.latlon_to_rowcol(*start_latlon)
        r2, c2 = self.latlon_to_rowcol(*end_latlon)
        
        min_r = max(0, min(r1, r2) - buffer_px)
        max_r = min(self.height, max(r1, r2) + buffer_px + 1)
        min_c = max(0, min(c1, c2) - buffer_px)
        max_c = min(self.width, max(c1, c2) + buffer_px + 1)
        
        sub_elev = self.elevation_grid[min_r:max_r, min_c:max_c]
        sub_slope = self.slope_grid[min_r:max_r, min_c:max_c]
        
        # Local sub-grid start & end indices
        local_start = (r1 - min_r, c1 - min_c)
        local_end = (r2 - min_r, c2 - min_c)
        
        return {
            "elevation": sub_elev,
            "slope": sub_slope,
            "min_r": min_r,
            "min_c": min_c,
            "local_start": local_start,
            "local_end": local_end,
            "cell_size_m": self.cell_size_m
        }

    def generate_synthetic_jezero_dem(self):
        """
        Generates a realistic Digital Elevation Model (DEM) of Jezero Crater, Mars 
        with realistic crater rims, delta channel deposits, and terrain noise, 
        saved as a GeoTIFF if no dataset exists.
        """
        os.makedirs(os.path.dirname(self.dem_path), exist_ok=True)
        
        # Grid parameters: 300x300 pixels covering Jezero Crater region
        # Bounds: Lat [18.35, 18.55], Lon [77.35, 77.55]
        height, width = 300, 300
        min_lat, max_lat = 18.35, 18.55
        min_lon, max_lon = 77.35, 77.55
        
        lats = np.linspace(max_lat, min_lat, height)
        lons = np.linspace(min_lon, max_lon, width)
        lon_mg, lat_mg = np.meshgrid(lons, lats)
        
        # Base floor elevation (~ -2550m)
        elev = np.full((height, width), -2550.0)
        
        # 1. Jezero Crater Rim (~45 km diameter crater centered at 18.4447 N, 77.4508 E)
        center_lat, center_lon = 18.4447, 77.4508
        dist_from_center = np.sqrt(((lat_mg - center_lat) * 59.26)**2 + ((lon_mg - center_lon) * 56.22)**2) # in km
        
        # Rim wall profile at r ~= 22 km
        rim_mask = dist_from_center >= 18.0
        rim_elevation = -2550.0 + 350.0 * (1.0 / (1.0 + np.exp(-(dist_from_center - 21.0)*0.8)))
        elev[rim_mask] = rim_elevation[rim_mask]
        
        # 2. Neretva Vallis River Delta deposit in Western Sector (~18.455 N, 77.418 E)
        delta_dist = np.sqrt(((lat_mg - 18.455) * 59.26)**2 + ((lon_mg - 77.418) * 56.22)**2)
        delta_fan = 80.0 * np.exp(-(delta_dist / 3.0)**2)
        elev += delta_fan
        
        # 3. Belva Impact Crater (~18.428 N, 77.465 E)
        belva_dist = np.sqrt(((lat_mg - 18.428) * 59.26)**2 + ((lon_mg - 77.465) * 56.22)**2)
        belva_pit = -120.0 * np.exp(-(belva_dist / 1.2)**2)
        elev += belva_pit
        
        # 4. Geological surface micro-texture noise
        rng = np.random.default_rng(42)
        noise = rng.normal(0, 4.0, size=(height, width))
        elev += noise
        
        # Define spatial affine transform
        res_lat = (max_lat - min_lat) / height
        res_lon = (max_lon - min_lon) / width
        transform = from_origin(min_lon, max_lat, res_lon, res_lat)
        
        # Write GeoTIFF
        with rasterio.open(
            self.dem_path,
            'w',
            driver='GTiff',
            height=height,
            width=width,
            count=1,
            dtype=elev.dtype,
            crs='+proj=longlat +datum=WGS84 +no_defs',
            transform=transform,
        ) as dst:
            dst.write(elev.astype(np.float32), 1)
