import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CategorySpending } from '../api/types'
import { formatBRL, isMoney } from '../lib/money'

interface ChartDatum {
  category: string
  amount: string
  scale: number
}

// Beyond this many integer digits a double can no longer place the bar faithfully.
const MAX_SCALE_DIGITS = 15

const axisFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const tick = { fill: 'var(--chart-text)', fontSize: 12 }

function shorten(label: string): string {
  return label.length > 14 ? `${label.slice(0, 13)}…` : label
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ChartDatum }>
}) {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <p className="text-slate-500 dark:text-slate-400">{datum.category}</p>
      <p className="font-semibold tabular-nums">{formatBRL(datum.amount)}</p>
    </div>
  )
}

export function CategoryChart({ items }: { items: CategorySpending[] }) {
  const plottable = items.every(
    (item) => isMoney(item.amount) && item.amount.length <= MAX_SCALE_DIGITS + 3,
  )
  if (!plottable) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Valores acima do limite do gráfico. Consulte os valores exatos abaixo.
      </p>
    )
  }

  // The only number conversion of money in the app: it positions the bars and nothing else.
  // Every displayed value is formatted from the original decimal string.
  const data: ChartDatum[] = items.map((item) => ({
    category: item.category,
    amount: item.amount,
    scale: Number(item.amount),
  }))

  return (
    <div
      role="img"
      aria-label="Gráfico de barras dos gastos por categoria. Os valores exatos estão na lista a seguir."
      style={{ height: Math.max(items.length, 3) * 36 + 32 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            tick={tick}
            tickFormatter={(value: number) => axisFormat.format(value)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            width={112}
            tick={tick}
            tickFormatter={shorten}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'var(--chart-hover)' }} content={<ChartTooltip />} />
          <Bar
            dataKey="scale"
            fill="var(--chart-bar)"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
