/** Tema ECharts alineado al chrome oscuro de ResponseLens. */
export const ECHART_THEME_NAME = 'responselens-dark';

export const ECHART_RL_THEME = {
  color: ['#2dd4bf', '#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f43f5e', '#94a3b8'],
  backgroundColor: 'transparent',
  textStyle: {
    color: '#9aa8c0',
    fontFamily: "Figtree, 'Segoe UI', sans-serif",
  },
  title: {
    textStyle: { color: '#e8eef8', fontWeight: 600 },
    subtextStyle: { color: '#6b7a94' },
  },
  legend: {
    textStyle: { color: '#9aa8c0' },
  },
  tooltip: {
    backgroundColor: 'rgba(20, 28, 46, 0.96)',
    borderColor: 'rgba(255,255,255,0.12)',
    textStyle: { color: '#e8eef8' },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    axisLabel: { color: '#9aa8c0' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
    axisLabel: { color: '#9aa8c0' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
  },
};
