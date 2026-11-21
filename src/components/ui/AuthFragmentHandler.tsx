"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/server/auth/client";

/**
 * Consumes a session that arrives in the URL fragment.
 *
 * Links minted outside the browser's own PKCE flow - an emailed link opened on a
 * different device than the one that requested it, or an access link handed to a
 * tester directly - come back from Supabase with the session in the fragment
 * (#access_token=...), which no server route can read. The sign-in page runs
 * this on mount: the browser client detects the fragment, stores the session,
 * and the visitor is sent on to operations instead of staring at a sign-in form
 * that says they are not signed in.
 */
export function AuthFragmentHandler({ locale }: { locale: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;
        const url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.pathname + url.search);
        router.push(`/${locale}/operations`);
        router.refresh();
      } catch {
        /* No session in the URL and none in storage: the form below is the answer. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, router]);

  return null;
}
