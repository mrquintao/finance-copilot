import SwiftUI

struct EmptyStateView: View {
    var title = "Nenhuma transação"
    var message = "Escolha outro período. Os dados de exemplo vão de abril a setembro de 2026."

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray").font(.largeTitle).foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}

struct ErrorStateView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.largeTitle)
            Text(message).multilineTextAlignment(.center)
            Button("Tentar novamente", action: retry).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}
