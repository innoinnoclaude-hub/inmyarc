import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

/**
 * The passcode is held in memory for the tab only — never localStorage, so a
 * shared machine does not stay unlocked. It is re-sent with every privileged
 * call because the database, not the app, is what actually checks it.
 */
interface PasscodeApi {
  passcode: string | null;
  unlocked: boolean;
  unlock: (candidate: string) => Promise<void>;
  lock: () => void;
}

const Ctx = createContext<PasscodeApi>({
  passcode: null,
  unlocked: false,
  unlock: async () => {},
  lock: () => {},
});

export const usePasscode = () => useContext(Ctx);

export function PasscodeProvider({ children }: { children: ReactNode }) {
  const [passcode, setPasscode] = useState<string | null>(null);

  const unlock = useCallback(async (candidate: string) => {
    const { data, error } = await supabase.rpc("verify_passcode", {
      p_pass: candidate,
    });
    if (error) throw new Error(error.message);
    if (data !== true) throw new Error("Incorrect passcode.");
    setPasscode(candidate);
  }, []);

  const lock = useCallback(() => setPasscode(null), []);

  return (
    <Ctx.Provider value={{ passcode, unlocked: passcode !== null, unlock, lock }}>
      {children}
    </Ctx.Provider>
  );
}
