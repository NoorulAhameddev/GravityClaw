import { Router } from "express";
import { config } from "../config.ts";
import { createLogger } from "../logger.ts";
import { createSessionToken } from "../middleware/websocket-auth.ts";

const log = createLogger("sso");
export const router = Router();

let passport: any = null;
const importModule = async (name: string) => { try { return await import(name); } catch { return null; } };
try {
    const passportMod = await importModule("passport");
    passport = passportMod.default || passportMod;

    if (passport) {
        try {
            const samlMod = await importModule("@node-saml/passport-saml");
            const SamlStrategy = samlMod.Strategy;
            if (config.SAML_ENABLED === "true") {
                passport.use(new SamlStrategy({
                    entryPoint: config.SAML_ENTRY_POINT!,
                    issuer: config.SAML_ISSUER!,
                    callbackUrl: config.SAML_CALLBACK_URL!,
                    cert: config.SAML_CERT!,
                }, (profile: any, done: any) => {
                    done(null, { id: profile.nameID, email: profile.email, provider: "saml" });
                }));
                log.info("SAML strategy configured");
            }
        } catch {
            log.info("SAML strategy unavailable");
        }

        try {
            const oidcMod = await importModule("openid-client");
            const OidcStrategy = oidcMod.Strategy;
            const Issuer = oidcMod.Issuer;
            if (config.OIDC_ENABLED === "true") {
                const client = await Issuer.discover(config.OIDC_ISSUER!);
                passport.use("oidc", new OidcStrategy({
                    client,
                    params: { redirect_uri: config.OIDC_CALLBACK_URL! },
                }, (tokenset: any, userinfo: any, done: any) => {
                    done(null, { id: userinfo.sub, email: userinfo.email, provider: "oidc" });
                }));
                log.info("OIDC strategy configured");
            }
        } catch {
            log.info("OIDC strategy unavailable");
        }
    }
} catch {
    log.info("passport not available, SSO disabled");
}

router.get("/:provider", (req, res, next) => {
    if (!passport) {
        return res.status(501).json({ error: "SSO not configured" });
    }
    const provider = req.params.provider as string;
    const strategy = provider === "saml" ? "saml" : provider === "oidc" ? "oidc" : null;
    if (!strategy) return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    passport.authenticate(strategy)(req, res, next);
});

router.post("/:provider/callback", (req, res, next) => {
    if (!passport) {
        return res.status(501).json({ error: "SSO not configured" });
    }
    const provider = req.params.provider as string;
    const strategy = provider === "saml" ? "saml" : "oidc";
    passport.authenticate(strategy, { failureRedirect: "/auth/sso/failure" })(req, res, next);
}, (req: any, res: any) => {
    const token = createSessionToken(req.user?.id || "sso-user", req.user?.id, "sso");
    res.redirect(`/dashboard?token=${token}`);
});

router.get("/failure", (_req, res) => {
    res.status(401).json({ error: "SSO authentication failed" });
});
