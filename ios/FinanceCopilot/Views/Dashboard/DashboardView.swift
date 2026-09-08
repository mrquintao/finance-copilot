import Charts
import SwiftUI

struct DashboardView: View {
    @Binding var period: Period
    @StateObject private var model: DashboardViewModel

    init(service: FinanceService, period: Binding<Period>) {
        _period = period
        _model = StateObject(wrappedValue: DashboardViewModel(service: service))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    PeriodFilterView(period: $period)
                    switch model.state {
                    case .loading:
                        ProgressView("Carregando resumo…").frame(maxWidth: .infinity).padding(40)
                    case .empty:
                        EmptyStateView()
                    case .failed(let message):
                        ErrorStateView(message: message) { Task { await model.load(period: period) } }
                    case .loaded(let data):
                        dashboard(data)
                    }
                }
                .padding(.horizontal)
            }
            .navigationTitle("Finance Copilot")
            .refreshable { await model.load(period: period) }
            .task(id: period) { await model.load(period: period) }
        }
    }

    @ViewBuilder
    private func dashboard(_ data: DashboardData) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Gastos no período").foregroundStyle(.secondary)
            Text(BRLFormat.string(data.summary.totalSpending.value))
                .font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .minimumScaleFactor(0.5).lineLimit(1)
            HStack {
                Text("Receitas")
                Spacer()
                Text(BRLFormat.string(data.summary.totalIncome.value)).fontWeight(.medium)
            }
            Text("\(data.summary.transactionCount) transações • \(data.summary.expenseCount) despesas")
                .font(.caption).foregroundStyle(.secondary)
            if data.summary.transferCount > 0 {
                Text("Transferências entre contas não entram nos gastos ou nas receitas.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))

        Text("Gastos por categoria").font(.title2.bold())
        if data.categories.isEmpty {
            EmptyStateView(title: "Nenhuma despesa", message: "Este período contém apenas receitas ou transferências.")
        } else {
            categoryChart(data.categories)
            ForEach(data.categories) { item in
                HStack {
                    VStack(alignment: .leading) {
                        Text(item.category)
                        Text("\(item.transactionCount) despesas").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(BRLFormat.string(item.amount.value)).monospacedDigit()
                }
                Divider()
            }
        }
    }

    @ViewBuilder
    private func categoryChart(_ items: [CategorySpending]) -> some View {
        if items.allSatisfy({ $0.amount.minorUnits != nil }) {
            Chart(items) { item in
                BarMark(
                    x: .value("Centavos", item.amount.minorUnits ?? 0),
                    y: .value("Categoria", item.category)
                )
                .foregroundStyle(Color.accentColor)
                .accessibilityLabel(item.category)
                .accessibilityValue(BRLFormat.string(item.amount.value))
            }
            .chartXAxis {
                AxisMarks { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let cents = value.as(Int64.self) {
                            Text(BRLFormat.string(Decimal(cents) / Decimal(100)))
                        }
                    }
                }
            }
            .frame(height: CGFloat(max(items.count, 3)) * 40)
        } else {
            Text("Valores acima do limite do gráfico. Consulte os valores exatos abaixo.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}
