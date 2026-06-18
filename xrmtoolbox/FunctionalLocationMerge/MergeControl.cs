using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;
using McTools.Xrm.Connection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Xrm.Sdk;
using XrmToolBox.Extensibility;

namespace FunctionalLocationMerge
{
    /// <summary>
    /// WebView2 host for the shared HTML de-dup app. On every connection change we push
    /// the org URL + a fresh OAuth access token into the page as window.XTB_CONFIG, then
    /// (re)load it so the JS picks "XrmToolBox (WebView2)" mode and calls the Web API directly.
    /// </summary>
    public partial class MergeControl : PluginControlBase
    {
        private readonly WebView2 _web;
        private bool _webReady;
        private string _orgUrl;
        private string _token;

        public MergeControl()
        {
            _web = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(_web);
            Load += async (s, e) => await InitWebViewAsync();
        }

        private async Task InitWebViewAsync()
        {
            // isolate the WebView2 user-data folder under %LOCALAPPDATA% so it works
            // even when the dll runs from a read-only Plugins folder.
            var udf = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FunctionalLocationMerge", "WebView2");
            Directory.CreateDirectory(udf);

            var env = await CoreWebView2Environment.CreateAsync(null, udf);
            await _web.EnsureCoreWebView2Async(env);
            _webReady = true;

            await PushConfigAndNavigateAsync();
        }

        /// <summary>Resolve org URL + token from the connection and (re)load the app.</summary>
        private async Task PushConfigAndNavigateAsync()
        {
            if (!_webReady) return;

            // inject config BEFORE any document script runs
            var configJs = string.IsNullOrEmpty(_orgUrl)
                ? "window.XTB_CONFIG = undefined;"
                : $"window.XTB_CONFIG = {{ baseUrl: {JsString(_orgUrl)}, token: {JsString(_token)} }};";

            await _web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(configJs);

            var html = Path.Combine(
                Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? ".",
                "app", "index.html");

            if (File.Exists(html))
                _web.CoreWebView2.Navigate(new Uri(html).AbsoluteUri);
            else
                _web.CoreWebView2.NavigateToString(
                    "<h3 style='font-family:Segoe UI'>app/index.html not found next to the plugin dll.</h3>" +
                    "<p>Ensure prx3_FunctionalLocationMerge.html was copied to the output 'app' folder.</p>");
        }

        private static string JsString(string s) =>
            s == null ? "null" : "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";

        /// <summary>Called by XrmToolBox whenever the active org connection changes.</summary>
        public override void UpdateConnection(
            IOrganizationService newService, ConnectionDetail detail,
            string actionName = "", object parameter = null)
        {
            base.UpdateConnection(newService, detail, actionName, parameter);

            try
            {
                _orgUrl = detail?.WebApplicationUrl?.TrimEnd('/')
                          ?? detail?.OrganizationServiceUrl?.Replace("/XRMServices/2011/Organization.svc", "").TrimEnd('/');

                // ServiceClient (CrmServiceClient in current XTB) exposes the OAuth bearer token
                var svc = detail?.ServiceClient;
                _token = svc?.CurrentAccessToken;

                if (string.IsNullOrEmpty(_token))
                    LogWarning("No OAuth access token available on this connection — " +
                               "the page will fall back to its manual token panel. Use an OAuth/MFA connection.");
            }
            catch (Exception ex)
            {
                LogError("Failed to resolve connection token: " + ex.Message);
            }

            // fire-and-forget reload with the new config
            _ = PushConfigAndNavigateAsync();
        }
    }
}
