import Foundation

struct Account: Decodable, Sendable {
    let id: UUID
    let name: String
    let institution: String
    let currency: String
}

struct Category: Decodable, Sendable {
    let id: UUID
    let name: String
}

enum TransactionType: String, Decodable, Sendable {
    case debit, credit, transfer

    var label: String {
        switch self {
        case .debit: return "Despesa"
        case .credit: return "Receita"
        case .transfer: return "Transferência"
        }
    }

    var symbol: String {
        switch self {
        case .debit: return "arrow.up.right"
        case .credit: return "arrow.down.left"
        case .transfer: return "arrow.left.arrow.right"
        }
    }
}

struct Transaction: Decodable, Identifiable, Sendable {
    let id: UUID
    let externalId: String?
    let accountId: UUID
    let account: Account
    let date: LocalDate
    let description: String
    let merchant: String?
    let amount: Money
    let currency: String
    let type: TransactionType
    let category: Category?
    let subcategory: String?
    let isRecurring: Bool
    let createdAt: String
    let updatedAt: String

    var title: String { merchant ?? description }
    var categoryName: String { category?.name ?? "Sem categoria" }
}

struct TransactionPage: Decodable, Sendable {
    let items: [Transaction]
    let total: Int
    let limit: Int
    let offset: Int
}
