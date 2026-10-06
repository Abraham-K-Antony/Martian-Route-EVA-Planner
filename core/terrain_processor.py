import os
import math
import numpy as np
import rasterio
from rasterio.transform import from_origin
from typing import Tuple, Dict, Optional, List

from core.config import MARS_RADIUS_M

DEFAULT_DEM_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "jezero_dem_downsampled.tif")

class DEMProcessor:
    """
    Ingests and parses Mars Digital Elevation Models (DEMs),
    calculates accurate meter-scale cell sizes based on Mars radius,
    and computes slope and terrain hazard masks.
    """
    
    def __init__(self, dem_path: str = DEFAULT_DEM_PATH):
        self.dem_path = dem_path
        self.is_synthetic = False
        if not os.path.exists(self.dem_path):
            self.generate_synthetic_jezero_dem()
        
        self.dataset = rasterio.open(self.dem_path)
        self.elevation_grid = self.dataset.read(1).astype(np.float32)
        
        # Validate NoData & NaN values at load
        if self.dataset.nodatavals and self.dataset.nodatavals[0] is not None:
            nodata_val = self.dataset.nodatavals[0]
            self.elevation_grid[self.elevation_grid == nodata_val] = np.nan
        
        nan_mask = np.isnan(self.elevation_grid) | np.isinf(self.elevation_grid)
        if np.any(nan_mask):
            valid_mean = float(np.nanmean(self.elevation_grid)) if not np.all(nan_mask) else -2550.0
            self.elevation_grid[nan_mask] = valid_mean

        self.transform = self.dataset.transform
        self.bounds = self.dataset.bounds
        self.crs = self.dataset.crs
        self.height, self.width = self.elevation_grid.shape
        
        # Determine CRS units and calculate physical cell resolution in meters using Mars Radius
        self.dy_m, self.dx_m, self.effective_resolution_m = self._calculate_mars_cell_resolution()
        
        # Compute slope grid in degrees using true physical dy_m and dx_m spacings
        self.slope_grid = self._compute_slope_grid()
        
        # Terrain Hazard Mask (Rock Scree / Soft Sand Ripples)
        self.hazard_mask = self._generate_hazard_mask()

    def _calculate_mars_cell_resolution(self) -> Tuple[float, float, float]:
        """
        Calculates physical cell dimensions (dy_m, dx_m) in meters.
        For geographic CRS (degrees), uses Mars radius R_mars = 3,389,500 m.
        """
        is_geographic = True
        if self.crs:
            crs_str = str(self.crs).lower()
            if "proj=" in crs_str and "longlat" not in crs_str:
                is_geographic = False
            elif "epsg:" in crs_str and crs_str not in ["epsg:4326", "epsg:4988"]:
                is_geographic = False
        
        deg_lat = abs(self.transform.e)
        deg_lon = abs(self.transform.a)
        
        if is_geographic:
            center_lat = (self.bounds.bottom + self.bounds.top) / 2.0
            lat_rad = math.radians(center_lat)
            
            dy_m = deg_lat * (math.pi / 180.0) * MARS_RADIUS_M
            dx_m = deg_lon * (math.pi / 180.0) * MARS_RADIUS_M * math.cos(lat_rad)
        else:
            dy_m = deg_lat
            dx_m = deg_lon
            
        effective_res_m = float((dy_m + dx_m) / 2.0)
        return float(dy_m), float(dx_m), effective_res_m

    def _compute_slope_grid(self) -> np.ndarray:
        """Calculates 2D slope array in degrees using physical dy_m and dx_m spacings."""
        dy, dx = np.gradient(self.elevation_grid, self.dy_m, self.dx_m)
        slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
        return np.degrees(slope_rad).astype(np.float32)

    def _generate_hazard_mask(self) -> np.ndarray:
        """
        Generates a terrain surface hazard cost multiplier layer
        (1.0 = nominal regolith, 1.4 = soft sand ripples, 2.2 = basalt rock scree).
        """
        gy, gx = np.gradient(self.slope_grid)
        curvature = np.sqrt(gx**2 + gy**2)
        
        mask = np.ones((self.height, self.width), dtype=np.float32)
        mask[curvature > 0.5] = 1.4
        mask[curvature > 1.2] = 2.2
        return mask

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
                     buffer_px: Optional[int] = None) -> Dict:
        """
        Extracts a focused spatial sub-grid around start and end points to 
        optimize graph construction and memory footprint.
        """
        r1, c1 = self.latlon_to_rowcol(*start_latlon)
        r2, c2 = self.latlon_to_rowcol(*end_latlon)
        
        if buffer_px is None:
            dist_px = math.sqrt((r1 - r2)**2 + (c1 - c2)**2)
            buffer_px = max(25, int(dist_px * 0.35))

        min_r = max(0, min(r1, r2) - buffer_px)
        max_r = min(self.height, max(r1, r2) + buffer_px + 1)
        min_c = max(0, min(c1, c2) - buffer_px)
        max_c = min(self.width, max(c1, c2) + buffer_px + 1)
        
        sub_elev = self.elevation_grid[min_r:max_r, min_c:max_c]
        sub_slope = self.slope_grid[min_r:max_r, min_c:max_c]
        sub_hazard = self.hazard_mask[min_r:max_r, min_c:max_c]
        
        local_start = (r1 - min_r, c1 - min_c)
        local_end = (r2 - min_r, c2 - min_c)
        
        return {
            "elevation": sub_elev,
            "slope": sub_slope,
            "hazard": sub_hazard,
            "min_r": min_r,
            "min_c": min_c,
            "local_start": local_start,
            "local_end": local_end,
            "dy_m": self.dy_m,
            "dx_m": self.dx_m,
            "effective_resolution_m": self.effective_resolution_m
        }

    def generate_synthetic_jezero_dem(self):
        """
        Generates a high-resolution Digital Elevation Model (DEM) of Jezero Crater, Mars 
        with realistic crater rims, delta channel deposits, and terrain noise, 
        saved as a GeoTIFF if no dataset exists.
        """
        self.is_synthetic = True
        os.makedirs(os.path.dirname(self.dem_path), exist_ok=True)
        
        # Grid parameters: 350x350 pixels covering Jezero Crater region
        height, width = 350, 350
        min_lat, max_lat = 18.35, 18.55
        min_lon, max_lon = 77.35, 77.55
        
        lats = np.linspace(max_lat, min_lat, height)
        lons = np.linspace(min_lon, max_lon, width)
        lon_mg, lat_mg = np.meshgrid(lons, lats)
        
        # Base floor elevation (~ -2550m)
        elev = np.full((height, width), -2550.0)
        
        # 1. Jezero Crater Rim (~45 km diameter crater centered at 18.4447 N, 77.4508 E)
        center_lat, center_lon = 18.4447, 77.4508
        dist_from_center = np.sqrt(((lat_mg - center_lat) * 59.16)**2 + ((lon_mg - center_lon) * 56.12)**2) # in km
        
        # Rim wall profile
        rim_mask = dist_from_center >= 18.0
        rim_elevation = -2550.0 + 380.0 * (1.0 / (1.0 + np.exp(-(dist_from_center - 21.0)*0.8)))
        elev[rim_mask] = rim_elevation[rim_mask]
        
        # 2. Neretva Vallis River Delta deposit in Western Sector (~18.455 N, 77.418 E)
        delta_dist = np.sqrt(((lat_mg - 18.455) * 59.16)**2 + ((lon_mg - 77.418) * 56.12)**2)
        delta_fan = 85.0 * np.exp(-(delta_dist / 3.0)**2)
        elev += delta_fan
        
        # 3. Belva Impact Crater (~18.428 N, 77.465 E)
        belva_dist = np.sqrt(((lat_mg - 18.428) * 59.16)**2 + ((lon_mg - 77.465) * 56.22)**2)
        belva_pit = -130.0 * np.exp(-(belva_dist / 1.2)**2)
        elev += belva_pit
        
        # 4. Geological surface micro-texture noise
        rng = np.random.default_rng(42)
        noise = rng.normal(0, 3.5, size=(height, width))
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
