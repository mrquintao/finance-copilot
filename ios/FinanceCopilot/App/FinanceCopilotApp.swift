import SwiftUI

@main
struct FinanceCopilotApp: App {
    private let configuration = Result { try APIClient.configured() }

    var body: some Scene {
        WindowGroup {
            switch configuration {
            case .success(let client):
                RootView(service: FinanceService(client: client))
                    .environment(\.locale, Locale(identifier: "pt_BR"))
            case .failure:
                VStack(spacing: 16) {
                    Image(systemName: "gearshape").font(.largeTitle)
                    Text("Configure o backend").font(.title2)
                    Text("Defina API_BASE_URL em Config/Local.xcconfig e execute o aplicativo novamente.")
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
    }
}

private struct RootView: View {
    let service: FinanceService
    @State private var period = Period.demo

    var body: some View {
        TabView {
            DashboardView(service: service, period: $period)
                .tabItem { Label("Resumo", systemImage: "chart.bar.xaxis") }
            TransactionsView(service: service, period: $period)
                .tabItem { Label("Transações", systemImage: "list.bullet.rectangle") }
            ConnectionsView(service: service)
                .tabItem { Label("Conexões", systemImage: "building.columns") }
        }
        .tint(.teal)
    }
}

private struct ConnectionsView: View {
    let service: FinanceService
    @Environment(\.openURL) private var openURL
    @State private var isSyncing = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Open Finance") {
                    Text("Conecte sua instituição financeira de forma segura. As credenciais do banco são tratadas pelo provedor e não ficam no Finance Copilot.")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    Button {
                        openURL(service.connectURL)
                    } label: {
                        Label("Conectar instituição", systemImage: "plus.circle.fill")
                    }

                    Button {
                        Task { await refresh() }
                    } label: {
                        HStack {
                            Label("Sincronizar agora", systemImage: "arrow.clockwise")
                            Spacer()
                            if isSyncing { ProgressView() }
                        }
                    }
                    .disabled(isSyncing)
                }

                if let message {
                    Section("Última ação") {
                        Text(message)
                    }
                }

                Section {
                    Text("Depois de conectar ou sincronizar, volte ao Resumo e puxe a tela para baixo para atualizar os dados.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Conexões")
        }
    }

    @MainActor
    private func refresh() async {
        isSyncing = true
        defer { isSyncing = false }
        do {
            let runs = try await service.refreshOpenFinance()
            guard !runs.items.isEmpty else {
                message = "Nenhuma instituição conectada ainda."
                return
            }
            let created = runs.items.reduce(0) { $0 + $1.transactionsCreated }
            let updated = runs.items.reduce(0) { $0 + $1.transactionsUpdated }
            message = "Sincronização concluída: \(created) novas e \(updated) atualizadas."
        } catch {
            message = displayError(error)
        }
    }
}
