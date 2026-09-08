import Combine
import Foundation

enum LoadState<Value> {
    case loading
    case empty
    case failed(String)
    case loaded(Value)
}

struct DashboardData {
    let summary: SpendingSummary
    let categories: [CategorySpending]
}

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published private(set) var state: LoadState<DashboardData> = .loading
    private let service: FinanceService
    private var requestID = UUID()

    init(service: FinanceService) { self.service = service }

    func load(period: Period) async {
        let id = UUID()
        requestID = id
        state = .loading
        do {
            async let summary = service.summary(for: period)
            async let categories = service.categories(for: period)
            let (summaryResult, categoryResult) = try await (summary, categories)
            let data = DashboardData(summary: summaryResult, categories: categoryResult.items)
            try Task.checkCancellation()
            guard requestID == id else { return }
            state = data.summary.transactionCount == 0 ? .empty : .loaded(data)
        } catch {
            guard requestID == id, !Task.isCancelled else { return }
            state = .failed(displayError(error))
        }
    }
}
