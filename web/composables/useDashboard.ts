export interface Metric {
  label: string
  value: number | string
  suffix?: string
  delta?: number
  icon: string
  color: string
}

export interface PrEntry {
  number: number
  title: string
  status: 'merged' | 'open' | 'closed'
  date: string
  branch: string
  cause: 'security' | 'performance' | 'dependency'
}

export interface DependencyChange {
  name: string
  before: string
  after: string
  type: 'major' | 'minor' | 'patch'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
}

export function useDashboard() {
  const metrics = ref<Metric[]>([
    { label: 'インスペクション実行数', value: 0, delta: 0, icon: 'i-heroicons-magnifying-glass', color: 'indigo' },
    { label: '自己修復ラン数', value: 0, delta: 0, icon: 'i-heroicons-arrow-path', color: 'blue' },
    { label: '平均スコア', value: 0, suffix: '/100', delta: 0, icon: 'i-heroicons-chart-bar', color: 'emerald' },
    { label: 'リスクスコア', value: 0, suffix: '/100', delta: 0, icon: 'i-heroicons-shield-check', color: 'amber' },
  ])

  const metricsLoading = ref(false)
  const { api } = useApi()

  const codeStats = ref({
    additions: 0,
    deletions: 0,
    filesChanged: 0,
    commits: 0,
    linesScanned: 0,
  })

  const causeData = ref({
    security: 67,
    performance: 33,
  })

  const prHistory = ref<PrEntry[]>([])
  const dependencyChanges = ref<DependencyChange[]>([])

  async function fetchMetrics() {
    metricsLoading.value = true
    try {
      const data = await api<{
        inspectionCount: number
        latestOverall: number
        avgOverall: number
        riskScore: number
        healingRuns: number
        prHistory: PrEntry[]
        dependencyChanges: DependencyChange[]
        causeData: { security: number; performance: number }
        codeStats: { additions: number; deletions: number; filesChanged: number; commits: number; linesScanned: number }
      }>('/metrics')
      metrics.value[0].value = data.inspectionCount
      metrics.value[1].value = data.healingRuns
      metrics.value[2].value = data.avgOverall
      metrics.value[3].value = data.riskScore

      if (data.codeStats) codeStats.value = data.codeStats
      if (data.causeData) causeData.value = data.causeData
      if (data.prHistory) prHistory.value = data.prHistory
      if (data.dependencyChanges) dependencyChanges.value = data.dependencyChanges
    } catch {
      // keep initial values on error
    } finally {
      metricsLoading.value = false
    }
  }

  return {
    metrics,
    metricsLoading,
    fetchMetrics,
    codeStats,
    causeData,
    prHistory,
    dependencyChanges,
  }
}
