import Combine
import Foundation

@MainActor
final class TransactionDetailViewModel: ObservableObject {
    @Published private(set) var state: LoadState<Transaction> = .loading
    private let service: FinanceService
    private var requestID = UUID()

    init(service: FinanceService) { self.service = service }

    func load(id: UUID) async {
        let token = UUID()
        requestID = token
        state = .loading
        do {
            let transaction = try await service.transaction(id: id)
            try Task.checkCancellation()
            guard requestID == token else { return }
            state = .loaded(transaction)
        } catch {
            guard requestID == token, !Task.isCancelled else { return }
            state = .failed(displayError(error))
        }
    }
}
