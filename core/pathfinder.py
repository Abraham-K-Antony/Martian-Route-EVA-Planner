import math
import heapq
import numpy as np
from typing import Tuple, Dict, List, Optional
from core.terrain_processor import DEMProcessor, MARS_RADIUS_M

# Physical Astronaut & xEMU Suit Parameters
M_ASTRONAUT_KG = 80.0
M_SUIT_KG = 140.0
M_TOTAL_KG = M_ASTRONAUT_KG + M_SUIT_KG  # 220 kg combined mass
G_MARS = 3.71  # m/s^2
G_EARTH = 9.81
GRAVITY_RATIO = G_MARS / G_EARTH  # ~0.378
SUIT_RESTRICTION_FACTOR = 1.35   # Suit rigidity energy multiplier

class MartianPathfinder:
    """
    Physically grounded A* pathfinding engine for Martian Extravehicular Activity (EVA).
    Computes metabolic energy cost (Joules), slope-dependent travel time (seconds),
    and hazard-mitigated safety paths over Mars DEM grids.
    """
    
    def __init__(self, dem_processor: Optional[DEMProcessor] = None):
        self.dem = dem_processor if dem_processor is not None else DEMProcessor()

    @staticmethod
    def calculate_metabolic_cost_per_m(slope_deg: float, grade: float) -> float:
        """
        Minetti metabolic walking cost function [Joules / meter] adapted for Mars gravity & xEMU suit.
        C(i) = M_total * (280.5 i^5 - 58.7 i^4 - 76.8 i^3 + 26.8 i^2 + 19.6 i + 2.5) * (g_mars/g_earth) * suit_factor
        """
        i = grade  # tan(slope)
        # Minetti polynomial for specific energy cost in J/(kg*m)
        j_per_kg_m = (280.5 * (i**5) - 58.7 * (i**4) - 76.8 * (i**3) + 26.8 * (i**2) + 19.6 * i + 2.5)
        j_per_kg_m = max(1.2, j_per_kg_m)  # Floor minimum cost per kg*m
        
        total_cost_per_m = M_TOTAL_KG * j_per_kg_m * GRAVITY_RATIO * SUIT_RESTRICTION_FACTOR
        return max(150.0, float(total_cost_per_m))  # Floor minimum 150 J/m

    @staticmethod
    def calculate_slope_dependent_speed(grade: float, base_speed_kmh: float = 3.5) -> float:
        """
        Tobler/Minetti slope-dependent walking speed [m/s] on Mars.
        Speed decreases on steep ascents/descents.
        """
        v_flat_ms = (base_speed_kmh * 1000.0) / 3600.0  # m/s
        # Speed multiplier based on incline grade
        speed_factor = math.exp(-3.5 * abs(grade + 0.05))
        v_ms = v_flat_ms * speed_factor
        return max(0.15, float(v_ms))  # Floor minimum speed at 0.15 m/s

    def calculate_single_route(
        self,
        start_latlon: Tuple[float, float],
        end_latlon: Tuple[float, float],
        mode: str = "lowest_energy",
        penalty_k: float = 10.0,
        max_slope_deg: float = 15.0,
        preferred_slope_deg: float = 8.0,
        walking_speed_kmh: float = 3.5,
        is_round_trip: bool = False
    ) -> Tuple[Dict, Dict]:
        """
        Executes array-based heapq A* pathfinding over spatial DEM sub-grid.
        Supported modes: 'lowest_energy', 'fastest', 'safest', 'legacy'.
        """
        sub = self.dem.get_sub_grid(start_latlon, end_latlon, buffer_px=30)
        elev_grid = sub["elevation"]
        slope_grid = sub["slope"]
        hazard_grid = sub["hazard"]
        min_r, min_c = sub["min_r"], sub["min_c"]
        start_node = sub["local_start"]
        end_node = sub["local_end"]
        dy_m, dx_m = sub["dy_m"], sub["dx_m"]
        
        rows, cols = elev_grid.shape
        
        # Check start & end node validity
        start_slope = slope_grid[start_node]
        end_slope = slope_grid[end_node]
        if start_slope > max_slope_deg:
            raise ValueError(f"Start location is impassable ({start_slope:.1f}° slope exceeds {max_slope_deg}° limit). Select a flatter starting point.")
        if end_slope > max_slope_deg:
            raise ValueError(f"Destination location is impassable ({end_slope:.1f}° slope exceeds {max_slope_deg}° limit). Select a flatter destination.")

        # 8-neighbor directional moves: (dr, dc, step_distance_m)
        directions = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                step_d = math.sqrt((dr * dy_m)**2 + (dc * dx_m)**2)
                directions.append((dr, dc, step_d))

        # Admissible heuristic base multiplier
        min_unit_cost = 150.0 if mode == "lowest_energy" else (1.0 / ((walking_speed_kmh * 1000.0) / 3600.0) if mode == "fastest" else 1.0)

        def heuristic(r: int, c: int) -> float:
            dist_m = math.sqrt(((r - end_node[0]) * dy_m)**2 + ((c - end_node[1]) * dx_m)**2)
            return dist_m * min_unit_cost

        pq = []
        heapq.heappush(pq, (0.0, start_node[0], start_node[1]))
        g_score = {start_node: 0.0}
        came_from = {}
        
        while pq:
            current_f, r, c = heapq.heappop(pq)
            current = (r, c)
            
            if current == end_node:
                break
                
            current_g = g_score[current]
            if current_f > current_g + heuristic(r, c):
                continue
                
            current_elev = float(elev_grid[r, c])
            
            for dr, dc, step_m in directions:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    neighbor = (nr, nc)
                    slope_val = float(slope_grid[nr, nc])
                    
                    # Hard slope constraint
                    if slope_val > max_slope_deg:
                        continue
                        
                    neighbor_elev = float(elev_grid[nr, nc])
                    delta_z = neighbor_elev - current_elev
                    grade = delta_z / step_m
                    hazard_mult = float(hazard_grid[nr, nc])
                    
                    # Soft preferred slope band penalty
                    soft_penalty = 1.0
                    if slope_val > preferred_slope_deg:
                        soft_penalty += 0.5 * ((slope_val - preferred_slope_deg) / (max_slope_deg - preferred_slope_deg))
                    
                    # Cost Computation
                    if mode == "lowest_energy":
                        cost_per_m = self.calculate_metabolic_cost_per_m(slope_val, grade)
                        step_cost = cost_per_m * step_m * hazard_mult * soft_penalty
                    elif mode == "fastest":
                        speed_ms = self.calculate_slope_dependent_speed(grade, walking_speed_kmh)
                        step_cost = (step_m / speed_ms) * hazard_mult * soft_penalty
                    elif mode == "safest":
                        step_cost = step_m * (1.0 + 15.0 * ((slope_val / max_slope_deg)**2)) * hazard_mult
                    else:  # Legacy mode
                        step_cost = step_m + (penalty_k * math.exp(slope_val * math.pi / 180.0))
                    
                    tentative_g = current_g + step_cost
                    if neighbor not in g_score or tentative_g < g_score[neighbor]:
                        g_score[neighbor] = tentative_g
                        came_from[neighbor] = current
                        f_score = tentative_g + heuristic(nr, nc)
                        heapq.heappush(pq, (f_score, nr, nc))

        if end_node not in came_from and start_node != end_node:
            raise ValueError(f"No safe route found between selected waypoints under the {max_slope_deg}° slope limit. Try increasing the max slope barrier or selecting intermediate waypoints around crater rims.")

        # Path Reconstruction
        path_nodes = []
        curr = end_node
        while curr in came_from:
            path_nodes.append(curr)
            curr = came_from[curr]
        path_nodes.append(start_node)
        path_nodes.reverse()

        # If Round Trip is selected, append reverse leg nodes
        if is_round_trip:
            return_leg = path_nodes[:-1][::-1]
            path_nodes = path_nodes + return_leg

        # Compute full telemetry metrics along path
        coordinates = []
        path_elevations = []
        path_slopes = []
        total_dist_m = 0.0
        total_energy_j = 0.0
        total_duration_sec = 0.0
        elev_gain_m = 0.0
        elev_loss_m = 0.0

        for i, (lr, lc) in enumerate(path_nodes):
            gr, gc = min_r + lr, min_c + lc
            lat, lon = self.dem.rowcol_to_latlon(gr, gc)
            elev = float(elev_grid[lr, lc])
            slope = float(slope_grid[lr, lc])
            
            coordinates.append([lat, lon])
            path_elevations.append(elev)
            path_slopes.append(slope)
            
            if i > 0:
                prev_lr, prev_lc = path_nodes[i-1]
                step_m = math.sqrt(((lr - prev_lr) * dy_m)**2 + ((lc - prev_lc) * dx_m)**2)
                total_dist_m += step_m
                
                delta_e = elev - path_elevations[i-1]
                if delta_e > 0:
                    elev_gain_m += delta_e
                else:
                    elev_loss_m += abs(delta_e)
                
                grade = delta_e / max(1.0, step_m)
                step_energy = self.calculate_metabolic_cost_per_m(slope, grade) * step_m
                step_speed = self.calculate_slope_dependent_speed(grade, walking_speed_kmh)
                
                total_energy_j += step_energy
                total_duration_sec += (step_m / max(0.1, step_speed))

        max_slope = float(np.max(path_slopes)) if path_slopes else 0.0
        avg_slope = float(np.mean(path_slopes)) if path_slopes else 0.0
        hazards_avoided = int(np.sum(slope_grid > (max_slope_deg * 0.65)))

        path_stats = {
            "mode": mode,
            "distance_m": round(total_dist_m, 1),
            "energy_j": round(total_energy_j, 0),
            "energy_kcal": round(total_energy_j / 4184.0, 1),
            "duration_sec": round(total_duration_sec, 0),
            "duration_h": round(total_duration_sec / 3600.0, 2),
            "duration_min": round(total_duration_sec / 60.0, 1),
            "max_slope": round(max_slope, 1),
            "avg_slope": round(avg_slope, 1),
            "elevation_gain_m": round(elev_gain_m, 1),
            "elevation_loss_m": round(elev_loss_m, 1),
            "hazards_avoided": max(3, hazards_avoided),
            "is_round_trip": is_round_trip,
            "effective_resolution_m": round(sub["effective_resolution_m"], 1),
            "resolution_warning": sub["effective_resolution_m"] > 30.0
        }

        # GeoJSON LineString
        geojson_features = []
        for i in range(len(coordinates) - 1):
            c1, c2 = coordinates[i], coordinates[i+1]
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[c1[1], c1[0]], [c2[1], c2[0]]]
                },
                "properties": {
                    "segment": i,
                    "elevation_start": path_elevations[i],
                    "elevation_end": path_elevations[i+1],
                    "slope": path_slopes[i]
                }
            })

        geojson_data = {
            "type": "FeatureCollection",
            "features": geojson_features,
            "properties": {
                "coordinates": coordinates,
                "elevations": path_elevations,
                "slopes": path_slopes,
                "stats": path_stats
            }
        }

        return geojson_data, path_stats

    def calculate_all_routes(
        self,
        start_latlon: Tuple[float, float],
        end_latlon: Tuple[float, float],
        penalty_k: float = 10.0,
        max_slope_deg: float = 15.0,
        preferred_slope_deg: float = 8.0,
        walking_speed_kmh: float = 3.5,
        is_round_trip: bool = False
    ) -> Dict:
        """
        Calculates side-by-side multi-route options:
        'lowest_energy', 'fastest', 'safest', 'legacy'.
        """
        routes = {}
        for mode in ["lowest_energy", "fastest", "safest", "legacy"]:
            try:
                g_json, stats = self.calculate_single_route(
                    start_latlon, end_latlon,
                    mode=mode,
                    penalty_k=penalty_k,
                    max_slope_deg=max_slope_deg,
                    preferred_slope_deg=preferred_slope_deg,
                    walking_speed_kmh=walking_speed_kmh,
                    is_round_trip=is_round_trip
                )
                routes[mode] = {
                    "coordinates": g_json["properties"]["coordinates"],
                    "elevations": g_json["properties"]["elevations"],
                    "slopes": g_json["properties"]["slopes"],
                    "geojson": g_json,
                    "stats": stats
                }
            except Exception as e:
                routes[mode] = {"error": str(e)}

        if not any("stats" in r for r in routes.values()):
            # Re-raise error from lowest_energy
            err_msg = next((r["error"] for r in routes.values() if "error" in r), "No passable route found.")
            raise ValueError(err_msg)

        # Recommendation choice
        recommended_mode = "lowest_energy" if "stats" in routes.get("lowest_energy", {}) else "safest"
        return {
            "recommended": recommended_mode,
            "routes": routes,
            "is_round_trip": is_round_trip
        }

def calculate_route(start: Tuple[float, float], end: Tuple[float, float], **kwargs):
    """Module function helper backward compatibility."""
    pathfinder = MartianPathfinder()
    multi = pathfinder.calculate_all_routes(start, end, **kwargs)
    rec_mode = multi["recommended"]
    rec_route = multi["routes"][rec_mode]
    return rec_route, rec_route["stats"]
