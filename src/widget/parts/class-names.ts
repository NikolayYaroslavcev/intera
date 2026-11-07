/** BEM block of the widget; every element class is `${CLASS}__element`. */
export const CLASS = 'dash-subscription-usage';

export function el(element: string): string {
  return `${CLASS}__${element}`;
}

export function cx(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
