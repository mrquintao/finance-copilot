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
const ROW_HEIGHT = 30
const AXIS_HEIGHT = 26
const LABEL_WIDTH = 108

const axisFormat = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function shorten(label: string): string {
  return label.length > 15 ? `${label.slice(0, 14)}…` : label
}

// Category names sit on the left edge, like the first column of a table.
function CategoryTick({ y, payload }: { y?: number; payload?: { value?: string } }) {
  return (
    <text x={0} y={y} dy="0.32em" textAnchor="start" fontSize={12} fill="var(--ink)">
      {shorten(payload?.value ?? '')}
    </text>
  )
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
    <div className="rounded-ctl border border-line-strong bg-raised px-3 py-2 text-sm shadow-md">
      <p className="text-xs text-ink-soft">{datum.category}</p>
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
      <p className="py-4 text-sm text-ink-soft">
        Valores acima do limite do gráfico. Consulte os valores exatos na tabela.
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
      aria-label="Gráfico de barras dos gastos por categoria. Os valores exatos estão na tabela."
      style={{ height: items.length * ROW_HEIGHT + AXIS_HEIGHT }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            height={AXIS_HEIGHT}
            tick={{ fill: 'var(--ink-soft)', fontSize: 11 }}
            tickFormatter={(value: number) => axisFormat.format(value)}
            tickCount={4}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            width={LABEL_WIDTH}
            tick={<CategoryTick />}
            axisLine={{ stroke: 'var(--line-strong)' }}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'var(--brand-soft)' }} content={<ChartTooltip />} />
          {/* One tone for every category: length is the encoding, color is not. */}
          <Bar
            dataKey="scale"
            fill="var(--chart-bar)"
            radius={[0, 2, 2, 0]}
            barSize={10}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
