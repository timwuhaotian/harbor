use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborSettings {
    pub hostname: String,
    pub uuid: String,
    pub websocket_path: String,
    pub local_port: u16,
    pub cloudflared_token: String,
    pub sing_box_path: String,
    pub cloudflared_path: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HarborSettingsDefaults {
    pub hostname: Option<String>,
    pub uuid: Option<String>,
    pub websocket_path: Option<String>,
    pub local_port: Option<u16>,
    pub cloudflared_token: Option<String>,
    pub sing_box_path: Option<String>,
    pub cloudflared_path: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub vless_link: String,
    pub sing_box_config: serde_json::Value,
}

#[derive(Debug, thiserror::Error)]
pub enum HarborError {
    #[error("{0}")]
    Validation(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Runtime error: {0}")]
    Runtime(String),
}

impl serde::Serialize for HarborError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub fn default_settings() -> HarborSettings {
    HarborSettings {
        hostname: "harbor.example.com".to_string(),
        uuid: Uuid::new_v4().to_string(),
        websocket_path: "/harbor".to_string(),
        local_port: 18080,
        cloudflared_token: String::new(),
        sing_box_path: String::new(),
        cloudflared_path: String::new(),
    }
}

pub fn default_settings_from_json(json: &str) -> Result<HarborSettings, HarborError> {
    let defaults = serde_json::from_str::<HarborSettingsDefaults>(json)?;
    Ok(apply_default_overrides(default_settings(), defaults))
}

pub fn apply_default_overrides(
    mut settings: HarborSettings,
    defaults: HarborSettingsDefaults,
) -> HarborSettings {
    if let Some(hostname) = defaults.hostname {
        settings.hostname = hostname;
    }

    if let Some(uuid) = defaults.uuid {
        settings.uuid = uuid;
    }

    if let Some(websocket_path) = defaults.websocket_path {
        settings.websocket_path = websocket_path;
    }

    if let Some(local_port) = defaults.local_port {
        settings.local_port = local_port;
    }

    if let Some(cloudflared_token) = defaults.cloudflared_token {
        settings.cloudflared_token = cloudflared_token;
    }

    if let Some(sing_box_path) = defaults.sing_box_path {
        settings.sing_box_path = sing_box_path;
    }

    if let Some(cloudflared_path) = defaults.cloudflared_path {
        settings.cloudflared_path = cloudflared_path;
    }

    settings
}

pub fn build_vless_link(settings: &HarborSettings) -> Result<String, HarborError> {
    let hostname = normalize_hostname(&settings.hostname)?;
    let uuid = normalize_uuid(&settings.uuid)?;
    let path = normalize_websocket_path(&settings.websocket_path)?;
    let encoded_path = urlencoding::encode(&path);

    Ok(format!(
        "vless://{uuid}@{hostname}:443?encryption=none&security=tls&type=ws&host={hostname}&sni={hostname}&path={encoded_path}#Harbor-Mac"
    ))
}

pub fn build_sing_box_config(settings: &HarborSettings) -> Result<serde_json::Value, HarborError> {
    let uuid = normalize_uuid(&settings.uuid)?;
    let path = normalize_websocket_path(&settings.websocket_path)?;

    Ok(json!({
        "log": {
            "level": "info",
            "timestamp": true
        },
        "inbounds": [
            {
                "type": "vless",
                "tag": "harbor-vless-in",
                "listen": "127.0.0.1",
                "listen_port": settings.local_port,
                "users": [
                    {
                        "uuid": uuid
                    }
                ],
                "transport": {
                    "type": "ws",
                    "path": path
                }
            }
        ],
        "outbounds": [
            {
                "type": "direct",
                "tag": "direct"
            }
        ],
        "route": {
            "final": "direct"
        }
    }))
}

pub fn build_preview(settings: &HarborSettings) -> Result<Preview, HarborError> {
    validate_start_settings(settings)?;

    Ok(Preview {
        vless_link: build_vless_link(settings)?,
        sing_box_config: build_sing_box_config(settings)?,
    })
}

pub fn validate_start_settings(settings: &HarborSettings) -> Result<(), HarborError> {
    normalize_hostname(&settings.hostname)?;
    normalize_uuid(&settings.uuid)?;
    normalize_websocket_path(&settings.websocket_path)?;

    if settings.local_port == 0 {
        return Err(HarborError::Validation("Local port is required".to_string()));
    }

    if settings.cloudflared_token.trim().is_empty() {
        return Err(HarborError::Validation(
            "Cloudflare tunnel token is required".to_string(),
        ));
    }

    Ok(())
}

fn normalize_hostname(hostname: &str) -> Result<String, HarborError> {
    let hostname = hostname.trim().trim_end_matches('/');

    if hostname.is_empty() {
        return Err(HarborError::Validation("Hostname is required".to_string()));
    }

    if hostname.contains("://") || hostname.contains('/') {
        return Err(HarborError::Validation(
            "Hostname should be a domain, not a URL".to_string(),
        ));
    }

    Ok(hostname.to_string())
}

fn normalize_uuid(uuid: &str) -> Result<String, HarborError> {
    let uuid = uuid.trim();

    Uuid::parse_str(uuid)
        .map(|parsed| parsed.to_string())
        .map_err(|_| HarborError::Validation("VLESS UUID is invalid".to_string()))
}

fn normalize_websocket_path(path: &str) -> Result<String, HarborError> {
    let path = path.trim();

    if path.is_empty() {
        return Err(HarborError::Validation(
            "WebSocket path is required".to_string(),
        ));
    }

    if path.starts_with('/') {
        Ok(path.to_string())
    } else {
        Ok(format!("/{path}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_settings() -> HarborSettings {
        HarborSettings {
            hostname: "harbor.example.com".to_string(),
            uuid: "6f111e13-f268-4f3c-a191-2f6446466dbe".to_string(),
            websocket_path: "/harbor ws".to_string(),
            local_port: 18080,
            cloudflared_token: "token".to_string(),
            sing_box_path: String::new(),
            cloudflared_path: String::new(),
        }
    }

    #[test]
    fn build_vless_link_should_encode_cloudflare_websocket_endpoint() {
        let link = build_vless_link(&valid_settings()).expect("valid settings should build link");

        assert_eq!(
            link,
            "vless://6f111e13-f268-4f3c-a191-2f6446466dbe@harbor.example.com:443?encryption=none&security=tls&type=ws&host=harbor.example.com&sni=harbor.example.com&path=%2Fharbor%20ws#Harbor-Mac"
        );
    }

    #[test]
    fn build_sing_box_config_should_create_plain_local_vless_ws_inbound() {
        let config = build_sing_box_config(&valid_settings()).expect("valid settings should build config");

        assert_eq!(config["inbounds"][0]["type"], "vless");
        assert_eq!(config["inbounds"][0]["listen"], "127.0.0.1");
        assert_eq!(config["inbounds"][0]["listen_port"], 18080);
        assert_eq!(config["inbounds"][0]["transport"]["type"], "ws");
        assert_eq!(config["inbounds"][0]["transport"]["path"], "/harbor ws");
        assert_eq!(config["outbounds"][0]["type"], "direct");
    }

    #[test]
    fn build_preview_should_reject_missing_cloudflare_token() {
        let settings = HarborSettings {
            cloudflared_token: "   ".to_string(),
            ..valid_settings()
        };

        let error = build_preview(&settings).expect_err("token is required to start tunnel");

        assert_eq!(error.to_string(), "Cloudflare tunnel token is required");
    }

    #[test]
    fn default_settings_from_json_should_merge_bundled_hostname_and_token() {
        let settings = default_settings_from_json(
            r#"{
                "hostname": "harbor.example.com",
                "cloudflaredToken": "connector-token"
            }"#,
        )
        .expect("valid bundled defaults should parse");

        assert_eq!(settings.hostname, "harbor.example.com");
        assert_eq!(settings.cloudflared_token, "connector-token");
        assert_eq!(settings.websocket_path, "/harbor");
        assert_eq!(settings.local_port, 18080);
    }
}
