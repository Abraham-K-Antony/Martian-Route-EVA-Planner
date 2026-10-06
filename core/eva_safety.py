import math
import numpy as np
from typing import Tuple, Dict, List, Optional

from core.config import (
    MARS_RADIUS_M, PLSS_O2_CAPACITY_LITERS, PLSS_MAX_DURATION_HOURS,
    PLSS_SAFETY_MARGIN_FACTOR, O2_DENSITY_KG_PER_L, DEFAULT_RELAY_STATIONS
)

class EVASafetyAnalyzer:
    """
    Advanced NASA EVA Safety & Mission Realism Engine.
    Computes metabolic oxygen consumption rate, PLSS consumable limits,
    Mars Sun position / solar glare / shadow hazards, aspect angles, 
    3D multi-station Line-of-Sight (LoS) comms mesh, and Point-of-No-Return (PoNR).
    """

    def __init__(self, dem_processor, relay_stations: Optional[List[Dict]] = None):
        self.dem = dem_processor
        self.relay_stations = relay_stations if relay_stations is not None else DEFAULT_RELAY_STATIONS

    def compute_aspect_grid(self, elev_grid: np.ndarray, dy_m: float, dx_m: float) -> np.ndarray:
        """
        Computes 2D terrain aspect grid (downhill slope facing direction in degrees, 0-360°).
        0° = North, 90° = East, 180° = South, 270° = West.
        """
        dz_dy, dz_dx = np.gradient(elev_grid, dy_m, dx_m)
        # Downhill gradient vector direction
        aspect_rad = np.arctan2(-dz_dx, -dz_dy)
        aspect_deg = np.degrees(aspect_rad) % 360.0
        return aspect_deg

    @staticmethod
    def get_mars_sun_position(lat_deg: float = 18.4447, lon_deg: float = 77.4508, local_solar_time_h: float = 14.0) -> Tuple[float, float]:
        """
        Calculates Mars Sun position (Elevation Angle, Azimuth Angle in degrees)
        for Jezero Crater at given local solar time (0-24h).
        Default: 14:00 (2:00 PM local Mars solar time).
        """
        # Hour angle H in degrees (0 at solar noon 12:00)
        hour_angle_deg = (local_solar_time_h - 12.0) * 15.0
        h_rad = math.radians(hour_angle_deg)
        lat_rad = math.radians(lat_deg)
        
        # Approximate solar declination for Jezero equinox (~0 deg)
        decl_rad = math.radians(0.0)
        
        # Sun elevation angle
        sin_elev = math.sin(lat_rad) * math.sin(decl_rad) + math.cos(lat_rad) * math.cos(decl_rad) * math.cos(h_rad)
        sin_elev = max(-1.0, min(1.0, sin_elev))
        sun_elev_deg = math.degrees(math.asin(sin_elev))
        
        # Sun azimuth angle
        cos_az = (math.sin(decl_rad) * math.cos(lat_rad) - math.cos(decl_rad) * math.sin(lat_rad) * math.cos(h_rad)) / max(0.001, math.cos(math.asin(sin_elev)))
        cos_az = max(-1.0, min(1.0, cos_az))
        az_deg = math.degrees(math.acos(cos_az))
        if hour_angle_deg > 0:
            az_deg = 360.0 - az_deg
            
        return float(sun_elev_deg), float(az_deg % 360.0)

    def analyze_path_safety(
        self,
        coordinates: List[List[float]],
        elevations: List[float],
        slopes: List[float],
        base_station_latlon: Tuple[float, float],
        walking_speed_kmh: float = 3.5,
        local_solar_time_h: float = 14.0
    ) -> Dict:
        """
        Performs comprehensive EVA safety telemetry analysis over path points:
        1. Metabolic Oxygen Consumption (L, kg, PLSS margin, tank %, duration limit)
        2. Solar Glare & Shadow Hazards (aspect angle vs sun position)
        3. 3D Line-of-Sight (LoS) Ray-Casting to Base Station / Rover
        4. Point-of-No-Return (PoNR) index & Return Reserve Buffer
        """
        total_pts = len(coordinates)
        if total_pts < 2:
            return {}

        sun_elev_deg, sun_az_deg = self.get_mars_sun_position(
            coordinates[0][0], coordinates[0][1], local_solar_time_h
        )

        o2_consumed_liters = 0.0
        o2_rates_lpm = []
        los_obstructed_flags = []
        sun_hazard_flags = [] # "glare", "shadow", "nominal"
        aspect_angles = []
        cum_durations_sec = [0.0]
        cum_distances_m = [0.0]
        cum_o2_liters = [0.0]
        
        # Base Station elevation + antenna height
        base_lat, base_lon = base_station_latlon
        base_elev = self.dem.get_elevation(base_lat, base_lon) + 2.5 # 2.5m antenna tower height

        ponr_idx = None # Point of No Return index
        return_buffer_violated = False

        for i in range(total_pts):
            lat, lon = coordinates[i]
            elev = elevations[i]
            slope = slopes[i]

            # 1. Slope Aspect & Solar Hazard
            r, c = self.dem.latlon_to_rowcol(lat, lon)
            # Sample local aspect from subgrid gradient
            if r > 0 and r < self.dem.height - 1 and c > 0 and c < self.dem.width - 1:
                dz_dy = (self.dem.elevation_grid[r-1, c] - self.dem.elevation_grid[r+1, c]) / (2.0 * self.dem.dy_m)
                dz_dx = (self.dem.elevation_grid[r, c+1] - self.dem.elevation_grid[r, c-1]) / (2.0 * self.dem.dx_m)
                asp_rad = math.atan2(-dz_dx, -dz_dy)
                asp_deg = math.degrees(asp_rad) % 360.0
            else:
                asp_deg = 180.0
            aspect_angles.append(round(asp_deg, 1))

            # Solar Hazard classification
            angle_diff = abs(asp_deg - sun_az_deg)
            if angle_diff > 180.0:
                angle_diff = 360.0 - angle_diff

            if angle_diff < 45.0 and slope > 10.0:
                hazard_type = "glare" # Direct blinding solar glare & steep sun-facing heat
            elif angle_diff > 135.0 or sun_elev_deg < 5.0:
                hazard_type = "shadow" # Deep shadow freezing / icy hazard
            else:
                hazard_type = "nominal"
            sun_hazard_flags.append(hazard_type)

            # 2. 3D Multi-Station Mesh Line-of-Sight (LoS) Ray-Casting
            has_conn, active_relay_name = self.check_multi_relay_los(lat, lon, elev)
            los_obstructed_flags.append(not has_conn)

            # 3. Oxygen Consumption & Cumulative Metrics
            if i > 0:
                prev_lat, prev_lon = coordinates[i-1]
                # Distance step
                d_lat = math.radians(lat - prev_lat) * MARS_RADIUS_M
                d_lon = math.radians(lon - prev_lon) * MARS_RADIUS_M * math.cos(math.radians((lat + prev_lat)/2.0))
                step_m = math.sqrt(d_lat**2 + d_lon**2)
                
                delta_z = elev - elevations[i-1]
                grade = delta_z / max(1.0, step_m)
                
                # Metabolic energy cost (J/m)
                i_grade = grade
                j_per_kg_m = (280.5 * (i_grade**5) - 58.7 * (i_grade**4) - 76.8 * (i_grade**3) + 26.8 * (i_grade**2) + 19.6 * i_grade + 2.5)
                j_per_kg_m = max(1.2, j_per_kg_m)
                total_cost_per_m = max(150.0, 220.0 * j_per_kg_m * (3.71 / 9.81) * 1.35)
                
                # Walking speed (m/s)
                v_flat_ms = (walking_speed_kmh * 1000.0) / 3600.0
                speed_factor = math.exp(-3.5 * abs(grade + 0.05))
                step_speed = max(0.15, v_flat_ms * speed_factor)
                
                step_time_sec = step_m / step_speed
                metabolic_power_w = total_cost_per_m * step_speed # Joules/sec = Watts
                
                # Oxygen consumption rate (L/min) with 1.2x PLSS margin factor
                # ~0.05 Liters O2 per kJ (1000 J)
                o2_rate_lpm = (metabolic_power_w * 0.00005) * 60.0 * PLSS_SAFETY_MARGIN_FACTOR
                o2_rates_lpm.append(round(o2_rate_lpm, 2))
                
                step_o2_l = o2_rate_lpm * (step_time_sec / 60.0)
                o2_consumed_liters += step_o2_l
                
                cum_durations_sec.append(cum_durations_sec[-1] + step_time_sec)
                cum_distances_m.append(cum_distances_m[-1] + step_m)
                cum_o2_liters.append(o2_consumed_liters)

                # Track Point of No Return (PoNR) index when cumulative O2 reaches 45% of tank capacity
                if ponr_idx is None and o2_consumed_liters >= (0.45 * PLSS_O2_CAPACITY_LITERS):
                    ponr_idx = i
            else:
                o2_rates_lpm.append(0.5)

        total_duration_h = cum_durations_sec[-1] / 3600.0
        o2_consumed_kg = o2_consumed_liters * O2_DENSITY_KG_PER_L
        plss_used_pct = min(100.0, (o2_consumed_liters / PLSS_O2_CAPACITY_LITERS) * 100.0)

        # Check safety violations
        is_exceeding_o2_tank = o2_consumed_liters > PLSS_O2_CAPACITY_LITERS
        is_exceeding_duration = total_duration_h > PLSS_MAX_DURATION_HOURS
        los_coverage_pct = round((sum(1 for x in los_obstructed_flags if not x) / total_pts) * 100.0, 1)

        # PoNR default to last index if not reached
        if ponr_idx is None:
            ponr_idx = total_pts - 1

        return {
            "o2_consumed_liters": round(o2_consumed_liters, 1),
            "o2_consumed_kg": round(o2_consumed_kg, 3),
            "plss_used_pct": round(plss_used_pct, 1),
            "plss_capacity_liters": PLSS_O2_CAPACITY_LITERS,
            "max_duration_h": PLSS_MAX_DURATION_HOURS,
            "exceeds_o2_capacity": is_exceeding_o2_tank,
            "exceeds_max_duration": is_exceeding_duration,
            "sun_elevation_deg": round(sun_elev_deg, 1),
            "sun_azimuth_deg": round(sun_az_deg, 1),
            "glare_hazards_count": sum(1 for h in sun_hazard_flags if h == "glare"),
            "shadow_hazards_count": sum(1 for h in sun_hazard_flags if h == "shadow"),
            "los_coverage_pct": los_coverage_pct,
            "los_obstructed_count": sum(1 for x in los_obstructed_flags if x),
            "active_relays_count": len(self.relay_stations),
            "point_of_no_return_index": ponr_idx,
            "point_of_no_return_coord": coordinates[ponr_idx],
            "aspect_angles": aspect_angles,
            "sun_hazard_flags": sun_hazard_flags,
            "los_obstructed_flags": los_obstructed_flags,
            "o2_rates_lpm": o2_rates_lpm
        }

    def check_multi_relay_los(self, lat: float, lon: float, elev: float) -> Tuple[bool, str]:
        """
        Checks Line-of-Sight connection across all active relay stations.
        Returns (has_connection: bool, active_relay_name: str).
        """
        best_relay = "Dead Zone (No Comms)"
        has_conn = False

        for st in self.relay_stations:
            d_lat = (lat - st["lat"]) * (math.pi / 180.0) * MARS_RADIUS_M
            d_lon = (lon - st["lon"]) * (math.pi / 180.0) * MARS_RADIUS_M * math.cos(math.radians(lat))
            dist_m = math.sqrt(d_lat**2 + d_lon**2)

            if dist_m <= st["range_m"]:
                st_elev = self.dem.get_elevation(st["lat"], st["lon"]) + st["height_m"]
                is_obstructed = self._check_los_ray(st["lat"], st["lon"], st_elev, lat, lon, elev + 2.0)
                if not is_obstructed:
                    has_conn = True
                    best_relay = st["name"]
                    break
        return has_conn, best_relay

    def _check_los_ray(self, lat1: float, lon1: float, z1: float, lat2: float, lon2: float, z2: float, samples: int = 15) -> bool:
        """
        Sample ray between base station (lat1, lon1, z1) and astronaut (lat2, lon2, z2).
        Returns True if DEM terrain obstructs the Line of Sight.
        """
        for t in np.linspace(0.1, 0.9, samples):
            lat_t = lat1 + t * (lat2 - lat1)
            lon_t = lon1 + t * (lon2 - lon1)
            los_z = z1 + t * (z2 - z1)
            
            dem_z = self.dem.get_elevation(lat_t, lon_t)
            if dem_z > (los_z + 0.5):
                return True
        return False
