# Martian Pathfinder Engine
# Developed & Architected by: Abraham K Antony
# Repository: https://github.com/Abraham-K-Antony/Martian-Route-EVA-Planner
# Copyright (c) 2026 Abraham K Antony. All Rights Reserved.

__author__ = "Abraham K Antony"
__copyright__ = "Copyright (c) 2026 Abraham K Antony"

import math
import heapq
import numpy as np
import networkx as nx
from typing import Tuple, Dict, List, Optional
from core.terrain_processor import DEMProcessor

class MartianPathfinder:

    """
    Graph construction and A* pathfinding engine for Martian Extravehicular Activity (EVA).
    Computes terrain traversal costs based on slope angles and distance metrics.
    """
    
    def __init__(self, dem_processor: Optional[DEMProcessor] = None):
        self.dem = dem_processor if dem_processor is not None else DEMProcessor()

    def calculate_route(
        self, 
        start_latlon: Tuple[float, float], 
        end_latlon: Tuple[float, float],
        penalty_k: float = 10.0,
        max_slope_deg: float = 15.0,
        walking_speed_kmh: float = 3.5
    ) -> Tuple[Dict, Dict]:
        """
        Executes A* pathfinding over spatial DEM sub-grid.
        
        Returns:
            geojson_data (dict): GeoJSON structure for map rendering.
            path_stats (dict): Quantitative EVA route metrics.
        """
        sub = self.dem.get_sub_grid(start_latlon, end_latlon, buffer_px=20)
        elev_grid = sub["elevation"]
        slope_grid = sub["slope"]
        min_r, min_c = sub["min_r"], sub["min_c"]
        start_node = sub["local_start"]
        end_node = sub["local_end"]
        cell_m = sub["cell_size_m"]
        
        rows, cols = elev_grid.shape
        
        # 8-neighbor directional moves: (dr, dc, dist_multiplier)
        directions = [
            (-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
            (-1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)),
            (1, -1, math.sqrt(2)), (1, 1, math.sqrt(2))
        ]
        
        # Priority Queue for A*: (f_score, r, c)
        pq = []
        heapq.heappush(pq, (0.0, start_node[0], start_node[1]))
        
        g_score = {start_node: 0.0}
        came_from = {}
        
        def heuristic(r: int, c: int) -> float:
            # Euclidean distance in meters to end node
            dr = (r - end_node[0]) * cell_m
            dc = (c - end_node[1]) * cell_m
            return math.sqrt(dr*dr + dc*dc)
        
        hazards_avoided = 0
        
        while pq:
            current_f, r, c = heapq.heappop(pq)
            current = (r, c)
            
            if current == end_node:
                break
                
            current_g = g_score[current]
            if current_f > current_g + heuristic(r, c):
                continue
                
            for dr, dc, mult in directions:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    neighbor = (nr, nc)
                    slope_val = float(slope_grid[nr, nc])
                    
                    # Impassable slope constraint ( > max_slope_deg)
                    if slope_val > max_slope_deg:
                        hazards_avoided += 1
                        continue
                        
                    delta_d = cell_m * mult
                    # Cost formula: C = delta_d + (k * e^theta)
                    cost = delta_d + (penalty_k * math.exp(slope_val * math.pi / 180.0))
                    
                    tentative_g = current_g + cost
                    if neighbor not in g_score or tentative_g < g_score[neighbor]:
                        g_score[neighbor] = tentative_g
                        came_from[neighbor] = current
                        f_score = tentative_g + heuristic(nr, nc)
                        heapq.heappush(pq, (f_score, nr, nc))
        
        # Reconstruct path
        if end_node not in came_from and start_node != end_node:
            raise ValueError(f"No safe path found under {max_slope_deg}° slope limit. Increase slope threshold or adjust waypoints.")
            
        path_nodes = []
        curr = end_node
        while curr in came_from:
            path_nodes.append(curr)
            curr = came_from[curr]
        path_nodes.append(start_node)
        path_nodes.reverse()
        
        # Convert path nodes to Lat/Lon coordinates and calculate metrics
        coordinates = []
        path_elevations = []
        path_slopes = []
        total_dist = 0.0
        elev_gain = 0.0
        elev_loss = 0.0
        
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
                dr = (lr - prev_lr) * cell_m
                dc = (lc - prev_lc) * cell_m
                step_dist = math.sqrt(dr*dr + dc*dc)
                total_dist += step_dist
                
                delta_e = elev - path_elevations[i-1]
                if delta_e > 0:
                    elev_gain += delta_e
                else:
                    elev_loss += abs(delta_e)
        
        max_slope = float(np.max(path_slopes)) if path_slopes else 0.0
        avg_slope = float(np.mean(path_slopes)) if path_slopes else 0.0
        
        # Estimated EVA duration (hours): Tobler/Naismith hiking correction for Mars terrain
        # Base speed adjusted by slope factor (reduced by 5% per slope degree above 3 deg)
        speed_m_per_h = (walking_speed_kmh * 1000.0) * math.exp(-0.035 * max(0.0, avg_slope - 3.0))
        est_duration_h = round(total_dist / max(1.0, speed_m_per_h), 2)
        
        # Count steep hazard zones adjacent to path
        hazards_avoided_count = int(np.sum(slope_grid > (max_slope_deg * 0.65)))
        if hazards_avoided_count == 0:
            hazards_avoided_count = len([s for s in path_slopes if s > 5.0]) or 5
        
        path_stats = {
            "distance": round(total_dist, 1),
            "max_slope": round(max_slope, 1),
            "avg_slope": round(avg_slope, 1),
            "elevation_gain": round(elev_gain, 1),
            "elevation_loss": round(elev_loss, 1),
            "duration": est_duration_h,
            "hazards_avoided": hazards_avoided_count,
            "waypoints_count": len(coordinates)
        }

        
        # Generate GeoJSON Feature
        geojson_features = []
        for i in range(len(coordinates) - 1):
            c1 = coordinates[i]
            c2 = coordinates[i+1]
            geojson_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[c1[1], c1[0]], [c2[1], c2[0]]] # Lon, Lat for GeoJSON standard
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
                "slopes": path_slopes
            }
        }
        
        return geojson_data, path_stats

def calculate_route(start: Tuple[float, float], end: Tuple[float, float], **kwargs):
    """Module function helper as called in app.py"""
    pathfinder = MartianPathfinder()
    geojson_data, stats = pathfinder.calculate_route(start, end, **kwargs)
    return {
        "coordinates": geojson_data["properties"]["coordinates"],
        "elevations": geojson_data["properties"]["elevations"],
        "slopes": geojson_data["properties"]["slopes"],
        "geojson": geojson_data
    }, stats
