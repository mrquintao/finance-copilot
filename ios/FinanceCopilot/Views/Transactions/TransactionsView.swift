import SwiftUI

struct TransactionsView: View {
    @Binding var period: Period
    @StateObject private var model: TransactionsViewModel
    private let service: FinanceService

    init(service: FinanceService, period: Binding<Period>) {
        self.service = service
        _period = period
        _model = StateObject(wrappedValue: TransactionsViewModel(service: service))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                PeriodFilterView(period: $period)
                switch model.state {
                case .loading:
                    ProgressView("Carregando transações…").frame(maxWidth: .infinity, maxHeight: .infinity)
                case .empty:
                    EmptyStateView().frame(maxHeight: .infinity)
                case .failed(let message):
                    ErrorStateView(message: message) { Task { await model.load(period: period) } }
                        .frame(maxHeight: .infinity)
                case .loaded(let transactions):
                    List {
                        Section("\(model.total) transações") {
                            ForEach(transactions) { transaction in
                                NavigationLink {
                                    TransactionDetailView(id: transaction.id, service: service)
                                } label: {
                                    TransactionRow(transaction: transaction)
                                }
                            }
                        }
                        if let message = model.pageError {
                            Text(message).foregroundStyle(.secondary)
                        }
                        if model.hasMore {
                            Button {
                                Task { await model.loadMore() }
                            } label: {
                                HStack {
                                    Spacer()
                                    if model.isLoadingMore { ProgressView() }
                                    else { Text(model.pageError == nil ? "Carregar mais" : "Tentar novamente") }
                                    Spacer()
                                }
                            }
                            .disabled(model.isLoadingMore)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await model.load(period: period) }
                }
            }
            .navigationTitle("Transações")
            .task(id: period) { await model.load(period: period) }
        }
    }
}

private struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: transaction.type.symbol).foregroundStyle(.secondary).frame(width: 20)
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.title).font(.body.weight(.medium))
                Text("\(transaction.date.display) • \(transaction.categoryName)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                Text(BRLFormat.string(transaction.amount.value))
                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text(transaction.type.label).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
