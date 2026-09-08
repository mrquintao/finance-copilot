import Foundation

enum APIError: LocalizedError {
    case configuration, invalidPeriod, invalidResponse, notFound, server(Int)

    var errorDescription: String? {
        switch self {
        case .configuration: return "Configure a URL do backend em Config/Local.xcconfig."
        case .invalidPeriod: return "A data inicial deve ser anterior ou igual à data final."
        case .invalidResponse: return "O servidor retornou dados inválidos."
        case .notFound: return "Transação não encontrada."
        case .server(let status): return "O servidor está indisponível (\(status)). Tente novamente."
        }
    }
}

struct APIClient: Sendable {
    let baseURL: URL
    private let session: URLSession

    init(baseURL: URL, session: URLSession? = nil) throws {
        guard let scheme = baseURL.scheme, ["http", "https"].contains(scheme),
              baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil else {
            throw APIError.configuration
        }
        #if !DEBUG
        guard scheme == "https" else { throw APIError.configuration }
        #endif
        self.baseURL = baseURL
        if let session {
            self.session = session
        } else {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 20
            configuration.timeoutIntervalForResource = 30
            configuration.urlCache = nil
            configuration.httpCookieStorage = nil
            self.session = URLSession(configuration: configuration)
        }
    }

    static func configured() throws -> APIClient {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
              let url = URL(string: raw) else { throw APIError.configuration }
        return try APIClient(baseURL: url)
    }

    func get<T: Decodable & Sendable>(
        _ path: String, query: [URLQueryItem] = []
    ) async throws -> T {
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false
        ) else { throw APIError.configuration }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.configuration }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 404 { throw APIError.notFound }
            throw APIError.server(response.statusCode)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.invalidResponse }
    }
}

func displayError(_ error: Error) -> String {
    if let error = error as? APIError { return error.localizedDescription }
    return "Não foi possível conectar ao backend. Verifique a conexão e tente novamente."
}
