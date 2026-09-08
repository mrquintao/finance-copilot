import SwiftUI

struct TransactionDetailView: View {
    let id: UUID
    @StateObject private var model: TransactionDetailViewModel

    init(id: UUID, service: FinanceService) {
        self.id = id
        _model = StateObject(wrappedValue: TransactionDetailViewModel(service: service))
    }

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                ProgressView("Carregando transação…")
            case .empty:
                EmptyStateView(title: "Transação não encontrada", message: "Volte à lista e atualize os dados.")
            case .failed(let message):
                ErrorStateView(message: message) { Task { await model.load(id: id) } }
            case .loaded(let transaction):
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(transaction.title).font(.title2.bold())
                            Text(BRLFormat.string(transaction.amount.value))
                                .font(.largeTitle.weight(.semibold)).minimumScaleFactor(0.5).lineLimit(1)
                            Label(transaction.type.label, systemImage: transaction.type.symbol)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical)
                    }
                    Section("Detalhes") {
                        LabeledContent("Data", value: transaction.date.display)
                        LabeledContent("Descrição", value: transaction.description)
                        LabeledContent("Estabelecimento", value: transaction.merchant ?? "Não informado")
                        LabeledContent("Categoria", value: transaction.categoryName)
                        LabeledContent("Subcategoria", value: transaction.subcategory ?? "Não informada")
                        LabeledContent("Recorrente", value: transaction.isRecurring ? "Sim" : "Não")
                        LabeledContent("Moeda", value: transaction.currency)
                    }
                    Section("Conta") {
                        LabeledContent("Nome", value: transaction.account.name)
                        LabeledContent("Instituição", value: transaction.account.institution)
                    }
                    if transaction.type == .transfer {
                        Text("Transferência interna: excluída dos totais de gastos e receitas.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .refreshable { await model.load(id: id) }
            }
        }
        .navigationTitle("Transação")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: id) { await model.load(id: id) }
    }
}
