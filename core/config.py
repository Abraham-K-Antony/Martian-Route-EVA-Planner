"""
Martian Route & EVA Planner - Central Physics & Mission Configuration
Single source of truth for all physical constants, suit specs, and biomechanical parameters.
"""

# 1. Planetary Gravity & IAU Spatial Parameters
MARS_RADIUS_M = 3389500.0  # Source: IAU 2015 Volumetric Mean Radius of Mars (meters)
G_MARS = 3.71              # Source: NASA Mars Fact Sheet surface gravity (m/s^2)
G_EARTH = 9.81             # Source: Standard Earth gravity (m/s^2)
GRAVITY_RATIO = G_MARS / G_EARTH  # ~0.3781 (ASSUMPTION: Linear metabolic scaling ratio)

# Note on Mars Gravity Scaling Simplification:
# Scaling Earth metabolic cost by (g_mars / g_earth) is a standard FIRST-ORDER APPROXIMATION
# used in planetary EVA literature. What this simplification IGNORES:
# 1. Gait Kinematics: Reduced gravity alters stride frequency, duty factor, and ground contact time.
# 2. Foot Slip & Regolith Traction: Martian regolith shear strength and loose dust alter traction cost.
# 3. Suit Inflexibility: Pressurized suit joint torques (xEMU) do not decrease under lower gravity.

# 2. Astronaut & xEMU Space Suit Bioenergetics (NASA EMU / Minetti 2002)
M_ASTRONAUT_KG = 80.0      # Source: NASA Human Integration Design Processes (HIDP) nominal crew mass (kg)
M_SUIT_KG = 140.0         # Source: NASA Exploration Extravehicular Mobility Unit (xEMU) mass (kg)
M_TOTAL_KG = M_ASTRONAUT_KG + M_SUIT_KG  # 220.0 kg combined mass

# Pressurized Suit Movement Restriction
SUIT_RESTRICTION_FACTOR = 1.35  # Source: NASA xEMU mobility studies (1.35x energy penalty for joint stiffness)

# Minetti 2002 Biomechanical Validity Limits
MINETTI_MAX_GRADE = 0.45   # Source: Minetti et al. (2002) empirical validity ceiling (+45% incline grade, ~24.2 deg)
MINETTI_MIN_GRADE = -0.45  # Source: Minetti et al. (2002) empirical validity floor (-45% decline grade, ~-24.2 deg)

# 3. Primary Life Support System (PLSS) Consumables & Oxygen Derivation
# Oxygen Derivation Explanation:
# - 840.0 Liters represents the NOMINAL GASEOUS OXYGEN VOLUME AT STP (0°C, 1 atm) contained in suit tanks.
# - 0.001429 kg/L represents OXYGEN DENSITY AT STP (1.429 g/L). Total gaseous O2 mass = 840 L * 0.001429 = ~1.20 kg O2.
# - Human metabolic O2 consumption is ~0.05 Liters O2 per kilojoule (kJ) of metabolic work performed.
PLSS_O2_CAPACITY_LITERS = 840.0  # Source: NASA xEMU PLSS specifications (gaseous volume at STP)
PLSS_MAX_DURATION_HOURS = 8.0     # Source: NASA EVA Operations nominal mission limit (8.0 hours)
PLSS_SAFETY_MARGIN_FACTOR = 1.20  # Source: NASA EVA safety protocol (1.20x / 20% contingency reserve factor)
O2_DENSITY_KG_PER_L = 0.001429    # Source: Standard physical constant for O2 gas at STP (kg/L)

# 4. Base Station Relay Mesh
DEFAULT_RELAY_STATIONS = [
    {"id": "relay_perseverance", "name": "Perseverance Rover Relay", "lat": 18.4447, "lon": 77.4508, "height_m": 2.5, "range_m": 6000.0},
    {"id": "relay_ingenuity", "name": "Ingenuity Airfield Relay", "lat": 18.4480, "lon": 77.4450, "height_m": 1.5, "range_m": 3500.0},
    {"id": "relay_jezero_rim", "name": "Jezero Rim Tower Relay", "lat": 18.4720, "lon": 77.3850, "height_m": 15.0, "range_m": 18000.0}
]
