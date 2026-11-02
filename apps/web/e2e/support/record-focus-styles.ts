import type { Locator } from "@playwright/test";

export const recordFocusStyle = (control: Locator): Promise<FocusStyle> =>
  control.evaluate((element) => {
    const { outline, outlineStyle, boxShadow } = getComputedStyle(element);
    return {
      outline,
      boxShadow,
      hasVisibleIndicator: outlineStyle !== "none" || boxShadow !== "none",
    };
  });

export const hasFocusIndicatorChange = ({ unfocused, focused }: StylePair): boolean =>
  focused.hasVisibleIndicator &&
  (unfocused.outline !== focused.outline || unfocused.boxShadow !== focused.boxShadow);

export interface FocusStyle {
  readonly outline: string;
  readonly boxShadow: string;
  readonly hasVisibleIndicator: boolean;
}

interface StylePair {
  readonly unfocused: FocusStyle;
  readonly focused: FocusStyle;
}
