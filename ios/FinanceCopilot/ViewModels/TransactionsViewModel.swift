import Combine
import Foundation

@MainActor
final class TransactionsViewModel: ObservableObject {
    @Published private(set) var state: LoadState<[Transaction]> = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var pageError: String?
    @Published private(set) var total = 0
    private let service: FinanceService
    private var requestID = UUID()
    private var period: Period?
    private var nextOffset = 0

    init(service: FinanceService) { self.service = service }

    var hasMore: Bool { nextOffset < total }

    func load(period: Period) async {
        let id = UUID()
        requestID = id
        self.period = period
        state = .loading
        total = 0
        nextOffset = 0
        pageError = nil
        isLoadingMore = false
        do {
            let page = try await service.transactions(for: period)
            try Task.checkCancellation()
            guard requestID == id else { return }
            total = page.total
            nextOffset = page.items.count
            state = page.items.isEmpty ? .empty : .loaded(page.items)
        } catch {
            guard requestID == id, !Task.isCancelled else { return }
            state = .failed(displayError(error))
        }
    }

    func loadMore() async {
        guard !isLoadingMore, hasMore, let period,
              case .loaded(let existing) = state else { return }
        let id = requestID
        isLoadingMore = true
        pageError = nil
        defer { if requestID == id { isLoadingMore = false } }
        do {
            let page = try await service.transactions(for: period, offset: nextOffset)
            try Task.checkCancellation()
            guard requestID == id else { return }
            let knownIDs = Set(existing.map(\.id))
            state = .loaded(existing + page.items.filter { !knownIDs.contains($0.id) })
            total = page.total
            nextOffset = page.items.isEmpty ? page.total : nextOffset + page.items.count
        } catch {
            guard requestID == id, !Task.isCancelled else { return }
            pageError = displayError(error)
        }
    }
}
