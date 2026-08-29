import React from "react";
import { useAuth } from "@/lib/AuthContext";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  const { appPublicSettings } = useAuth();
  const termsUrl = appPublicSettings?.terms_url;
  const privacyUrl = appPublicSettings?.privacy_url;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
        {termsUrl && privacyUrl && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            By continuing you agree to our{" "}
            <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Terms
            </a>{" "}
            and{" "}
            <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
