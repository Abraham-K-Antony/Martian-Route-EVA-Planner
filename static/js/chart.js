/**
 * Martian Route & EVA Planner - Chart Engine
 * Interactive elevation & slope profile visualization using Chart.js with dual Y-axes
 * and map coordinate cross-highlighting.
 */

let chartInstance = null;
let activeRouteCoordinates = [];

export function initElevationChart() {
  const canvas = document.getElementById('elevationProfileCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
  const textColor = isDark ? '#9CA3AF' : '#6B7280';

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Elevation (m)',
          data: [],
          borderColor: '#2563EB',
          backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          yAxisID: 'yElevation',
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#2563EB'
        },
        {
          label: 'Slope (°)',
          data: [],
          borderColor: '#F59E0B',
          borderWidth: 1.5,
          borderDash: [3, 3],
          fill: false,
          tension: 0.2,
          yAxisID: 'ySlope',
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#F59E0B'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      onHover: (evt, activeEls) => {
        if (activeEls && activeEls.length > 0 && activeRouteCoordinates.length > 0) {
          const idx = activeEls[0].index;
          if (idx < activeRouteCoordinates.length) {
            window.dispatchEvent(new CustomEvent('inspectRoutePoint', {
              detail: { index: idx, coordinate: activeRouteCoordinates[idx] }
            }));
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { family: 'JetBrains Mono', size: 10 },
            color: textColor
          }
        },
        tooltip: {
          backgroundColor: isDark ? 'rgba(19, 27, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#F9FAFB' : '#111827',
          bodyColor: isDark ? '#D1D5DB' : '#374151',
          borderColor: isDark ? '#23314E' : '#E5E7EB',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          titleFont: { family: 'JetBrains Mono', size: 11, weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono', size: 10 },
          callbacks: {
            title: (items) => `Waypoint #${items[0].dataIndex + 1} (${items[0].label})`,
            label: (ctx) => {
              const val = ctx.raw;
              return ctx.datasetIndex === 0
                ? ` Elevation: ${val.toFixed(1)} m`
                : ` Slope: ${val.toFixed(1)}° (${getSlopeRiskLabel(val)})`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'JetBrains Mono', size: 9 },
            maxTicksLimit: 7
          }
        },
        yElevation: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'JetBrains Mono', size: 9 },
            callback: (v) => `${v}m`
          },
          title: {
            display: false,
            text: 'Elevation (m)'
          }
        },
        ySlope: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#F59E0B',
            font: { family: 'JetBrains Mono', size: 9 },
            callback: (v) => `${v}°`
          },
          title: {
            display: false,
            text: 'Slope (°)'
          }
        }
      }
    }
  });
}

export function updateElevationChartData(coordinates, elevations, slopes) {
  if (!chartInstance) {
    initElevationChart();
  }
  if (!chartInstance) return;

  activeRouteCoordinates = coordinates || [];

  // Compute cumulative distance labels
  let cumDistanceM = 0;
  const labels = elevations.map((_, i) => {
    if (i > 0 && coordinates && coordinates[i] && coordinates[i-1]) {
      const p1 = coordinates[i-1];
      const p2 = coordinates[i];
      const dLat = (p2[0] - p1[0]) * 111320.0;
      const dLon = (p2[1] - p1[1]) * 111320.0 * Math.cos((p1[0] * Math.PI) / 180.0);
      cumDistanceM += Math.sqrt(dLat * dLat + dLon * dLon);
    }
    return `${Math.round(cumDistanceM)}m`;
  });

  chartInstance.data.labels = labels;
  chartInstance.data.datasets[0].data = elevations || [];
  chartInstance.data.datasets[1].data = slopes || [];
  chartInstance.update();
}

function getSlopeRiskLabel(slopeDeg) {
  if (slopeDeg > 15) return 'Danger / Barrier';
  if (slopeDeg > 8) return 'Caution';
  return 'Nominal Safe';
}

// Listen to theme change to update chart colors dynamically
window.addEventListener('themeChanged', () => {
  if (chartInstance && activeRouteCoordinates.length > 0) {
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
    const textColor = isDark ? '#9CA3AF' : '#6B7280';

    chartInstance.options.scales.x.grid.color = gridColor;
    chartInstance.options.scales.x.ticks.color = textColor;
    chartInstance.options.scales.yElevation.grid.color = gridColor;
    chartInstance.options.scales.yElevation.ticks.color = textColor;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update();
  }
});
