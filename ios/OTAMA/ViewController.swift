import UIKit
import WebKit

/// OTAMA for iPhone — a focused WKWebView shell that opens the hosted OTAMA
/// server DIRECTLY. No address screen, no LAN pairing, no router setup: the
/// app works on any internet connection (Wi-Fi or cellular) because all
/// streaming happens on the hosted server; the app renders the exact same UI
/// as the browser.
///
/// Self-hosters can still point the app at their own domain via
/// "Use another server" on the connection-error screen — but the hosted
/// server is always the default and only visible destination.
final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private static let defaultServer = URL(string: "https://otama.space-z.ai")!
    private static let serverKey = "otama.server_url"

    private static let amber = UIColor(red: 0xF5 / 255.0, green: 0x9E / 255.0, blue: 0x0B / 255.0, alpha: 1)
    private static let bg = UIColor(red: 0x09 / 255.0, green: 0x09 / 255.0, blue: 0x0B / 255.0, alpha: 1)
    private static let zinc800 = UIColor(red: 0x27 / 255.0, green: 0x27 / 255.0, blue: 0x2A / 255.0, alpha: 1)
    private static let zinc400 = UIColor(red: 0xA1 / 255.0, green: 0xA1 / 255.0, blue: 0xAA / 255.0, alpha: 1)
    private static let zinc600 = UIColor(red: 0x52 / 255.0, green: 0x52 / 255.0, blue: 0x5B / 255.0, alpha: 1)

    private var webView: WKWebView!
    private var splashView: UIView?
    private var errorOverlay: UIView?
    private let refreshControl = UIRefreshControl()
    private var firstPageDone = false
    private var serverHost = ""
    private var connectedURL: URL = ViewController.defaultServer

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ViewController.bg
        buildWebView()
        buildSplash()
        loadServer(resolveTargetURL())
    }

    // MARK: - target url

    /// The hosted server is the default (and only visible) destination.
    /// A previously saved CUSTOM address is honored only if it is a public
    /// host — stale LAN/IP entries are dropped so the app can never
    /// cold-start trying to reach a machine that isn't there.
    private func resolveTargetURL() -> URL {
        guard let raw = UserDefaults.standard.string(forKey: Self.serverKey),
              !raw.isEmpty,
              let url = URL(string: raw),
              let host = url.host, !host.isEmpty else {
            return Self.defaultServer
        }
        if Self.isPrivateHost(host) {
            UserDefaults.standard.removeObject(forKey: Self.serverKey) // one-time cleanup
            return Self.defaultServer
        }
        return url
    }

    /// Private/LAN hosts are never honored on cold start — the app is a
    /// direct-host client of the hosted server, not a same-WiFi remote.
    static func isPrivateHost(_ host: String) -> Bool {
        let h = host.lowercased()
        if h == "localhost" || h == "127.0.0.1" || h.hasSuffix(".local") || h.hasSuffix(".lan") { return true }
        let parts = h.split(separator: ".")
        if parts.count == 4,
           let a = Int(parts[0]), let b = Int(parts[1]),
           parts.allSatisfy({ Int($0).map({ $0 >= 0 && $0 <= 255 }) == true }) {
            if a == 10 || a == 127 || a == 0 { return true }
            if a == 192 && b == 168 { return true }
            if a == 172 && b >= 16 && b <= 31 { return true }
            if a == 169 && b == 254 { return true }
        }
        return false
    }

    // MARK: - webview

    private func buildWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.allowsPictureInPictureMediaPlayback = true
        // HTML5 element-fullscreen: the web player falls back to the native
        // <video> fullscreen (webkitEnterFullscreen) on iOS, so playback and
        // fullscreen work out of the box without extra WKPreferences flags.
        cfg.applicationNameForUserAgent = "OTAMA-iOS/1.3.1"

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.backgroundColor = ViewController.bg
        webView.isOpaque = false
        webView.scrollView.backgroundColor = ViewController.bg
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Keep the system's automatic safe-area handling (status bar / home
        // indicator) and dismiss the keyboard naturally on swipe.
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive
        view.addSubview(webView)

        refreshControl.tintColor = ViewController.amber
        refreshControl.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    @objc private func pullToRefresh() {
        webView.reload()
    }

    private func loadServer(_ url: URL) {
        connectedURL = url
        serverHost = url.host ?? ""
        hideErrorOverlay()
        webView.load(URLRequest(url: url))
    }

    // MARK: - splash

    private func buildSplash() {
        let splash = UIView(frame: view.bounds)
        splash.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        splash.backgroundColor = ViewController.bg

        let logo = UILabel()
        let body = NSMutableAttributedString(
            string: "OTAMA",
            attributes: [
                .font: UIFont.boldSystemFont(ofSize: 30),
                .foregroundColor: UIColor.white,
                .kern: 10.0,
            ]
        )
        logo.attributedText = body

        let tagline = UILabel()
        tagline.text = "torrent streaming, everywhere"
        tagline.font = .systemFont(ofSize: 13)
        tagline.textColor = ViewController.zinc400

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = ViewController.amber
        spinner.startAnimating()

        let stack = UIStackView(arrangedSubviews: [logo, tagline, spinner])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.setCustomSpacing(24, after: tagline)
        stack.translatesAutoresizingMaskIntoConstraints = false
        splash.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: splash.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: splash.centerYAnchor),
        ])

        view.addSubview(splash)
        splashView = splash
    }

    private func hideSplash() {
        firstPageDone = true
        guard let splash = splashView else { return }
        splashView = nil
        UIView.animate(withDuration: 0.25, animations: { splash.alpha = 0 }) { _ in
            splash.removeFromSuperview()
        }
    }

    // MARK: - connection error

    private func showErrorOverlay(_ systemMessage: String) {
        if errorOverlay != nil { return }

        let overlay = UIView(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = ViewController.bg

        let title = UILabel()
        title.text = "Can't reach OTAMA"
        title.font = .boldSystemFont(ofSize: 18)
        title.textColor = .white
        title.textAlignment = .center

        let detail = UILabel()
        detail.numberOfLines = 0
        detail.textAlignment = .center
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = ViewController.zinc400
        detail.text = "\(connectedURL.absoluteString)\n\n"
            + "OTAMA streams from a hosted server that should be\n"
            + "reachable on ANY internet connection — Wi-Fi or\n"
            + "cellular data, no setup needed.\n"
            + "Check that your internet is on, then Try again.\n\n"
            + "Running your own OTAMA server on a domain?\n"
            + "Tap \"Use another server\" to point the app at it.\n\n"
            + "(\(systemMessage))"

        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.setTitleColor(.black, for: .normal)
        retry.titleLabel?.font = .boldSystemFont(ofSize: 15)
        retry.backgroundColor = ViewController.amber
        retry.layer.cornerRadius = 10
        retry.heightAnchor.constraint(equalToConstant: 48).isActive = true
        retry.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        let other = UIButton(type: .system)
        other.setTitle("Use another server", for: .normal)
        other.setTitleColor(.white, for: .normal)
        other.titleLabel?.font = .systemFont(ofSize: 14)
        other.backgroundColor = ViewController.zinc800
        other.layer.cornerRadius = 10
        other.heightAnchor.constraint(equalToConstant: 44).isActive = true
        other.addTarget(self, action: #selector(otherServerTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, detail, retry, other])
        stack.axis = .vertical
        stack.spacing = 14
        stack.setCustomSpacing(18, after: detail)
        stack.setCustomSpacing(10, after: retry)
        stack.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            stack.widthAnchor.constraint(equalToConstant: 320),
        ])

        view.addSubview(overlay)
        errorOverlay = overlay
    }

    private func hideErrorOverlay() {
        errorOverlay?.removeFromSuperview()
        errorOverlay = nil
    }

    @objc private func retryTapped() {
        hideErrorOverlay()
        webView.reload()
    }

    @objc private func otherServerTapped() {
        presentServerDialog()
    }

    // MARK: - advanced: custom server

    private func presentServerDialog() {
        let alert = UIAlertController(
            title: "OTAMA server address",
            message: "Leave empty to always use the hosted server (otama.space-z.ai).",
            preferredStyle: .alert
        )
        alert.addTextField { tf in
            tf.placeholder = ViewController.defaultServer.absoluteString
            tf.keyboardType = .URL
            tf.autocapitalizationType = .none
            tf.autocorrectionType = .no
            let current = UserDefaults.standard.string(forKey: ViewController.serverKey) ?? ""
            tf.text = (current.isEmpty || current == ViewController.defaultServer.absoluteString) ? "" : current
        }
        alert.addAction(UIAlertAction(title: "Save", style: .default) { [weak self] _ in
            self?.applyServerInput(alert.textFields?.first?.text ?? "")
        })
        alert.addAction(UIAlertAction(title: "Use hosted server", style: .default) { [weak self] _ in
            guard let self else { return }
            UserDefaults.standard.removeObject(forKey: Self.serverKey)
            self.loadServer(Self.defaultServer)
        })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(alert, animated: true)
    }

    private func applyServerInput(_ rawInput: String) {
        let raw = rawInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.serverKey)
            loadServer(Self.defaultServer)
            return
        }
        var s = raw
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            s = "https://" + s
        }
        guard let url = URL(string: s), let host = url.host, !host.isEmpty else {
            let bad = UIAlertController(title: nil, message: "That address doesn't look right.", preferredStyle: .alert)
            bad.addAction(UIAlertAction(title: "OK", style: .default))
            present(bad, animated: true)
            return
        }
        UserDefaults.standard.set(url.absoluteString, forKey: Self.serverKey)
        loadServer(url)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        hideSplash()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        showErrorOverlay((error as NSError).localizedDescription)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if url.scheme?.lowercased() == "magnet" {
            decisionHandler(.cancel)
            let alert = UIAlertController(
                title: nil,
                message: "Add magnets from your OTAMA server UI",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }
        // Main-frame navigations away from the OTAMA server open in Safari
        // (TMDB, provider sites…). Subresource loads from CDNs are allowed.
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if isMainFrame, let host = url.host, !host.isEmpty, host != serverHost {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // window.open / target=_blank → Safari
        if let url = navigationAction.request.url,
           url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }
}
