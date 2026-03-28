"use client";

import { FIELD_GROUP_LABELS, parseFieldConfig, type FieldGroupKey } from "@/lib/campaign-fields";

type Props = {
  fieldConfigJson: string;
  companyName: string;
  onCompanyName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  cvr: string;
  onCvr: (v: string) => void;
  address: string;
  onAddress: (v: string) => void;
  postalCode: string;
  onPostalCode: (v: string) => void;
  city: string;
  onCity: (v: string) => void;
  industry: string;
  onIndustry: (v: string) => void;
  custom: Record<string, string>;
  onCustom: (key: string, value: string) => void;
};

const inputCls =
  "w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2";

const TOP_GROUPS: FieldGroupKey[] = ["companyName", "phone", "email"];

export function LeadDataLeftPanel({
  fieldConfigJson,
  companyName,
  onCompanyName,
  phone,
  onPhone,
  email,
  onEmail,
  cvr,
  onCvr,
  address,
  onAddress,
  postalCode,
  onPostalCode,
  city,
  onCity,
  industry,
  onIndustry,
  custom,
  onCustom,
}: Props) {
  const cfg = parseFieldConfig(fieldConfigJson);

  const baseSetters: Record<FieldGroupKey, (v: string) => void> = {
    companyName: onCompanyName,
    phone: onPhone,
    email: onEmail,
    cvr: onCvr,
    address: onAddress,
    postalCode: onPostalCode,
    city: onCity,
    industry: onIndustry,
  };

  const baseValues: Record<FieldGroupKey, string> = {
    companyName,
    phone,
    email,
    cvr,
    address,
    postalCode,
    city,
    industry,
  };

  const addressExtraFields = [
    ...(cfg.extensions.address ?? []),
    ...(cfg.extensions.postalCode ?? []),
    ...(cfg.extensions.city ?? []),
  ];

  const usedCustomKeys = new Set<string>();

  return (
    <div className="flex h-full flex-col space-y-6 lg:pr-6">
      {TOP_GROUPS.map((g) => (
        <section
          key={g}
          className="rounded-lg border border-stone-200/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            {FIELD_GROUP_LABELS[g]}
          </h3>
          <div className="mt-3 space-y-3">
            <div>
              <label className="sr-only">{FIELD_GROUP_LABELS[g]}</label>
              <input
                type={g === "email" ? "email" : "text"}
                autoComplete={g === "email" ? "email" : undefined}
                className={inputCls}
                value={baseValues[g]}
                onChange={(e) => baseSetters[g](e.target.value)}
                placeholder={g === "phone" ? "Telefonnummer (valgfrit)" : FIELD_GROUP_LABELS[g]}
                required={g === "companyName"}
              />
            </div>
            {(cfg.extensions[g] ?? []).map((f) => {
              if (usedCustomKeys.has(f.key)) return null;
              usedCustomKeys.add(f.key);
              return (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
                  <input
                    className={inputCls}
                    value={custom[f.key] ?? ""}
                    onChange={(e) => onCustom(f.key, e.target.value)}
                    placeholder={f.label}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-lg border border-stone-200/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {FIELD_GROUP_LABELS.address}
        </h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="sr-only">{FIELD_GROUP_LABELS.address}</label>
            <input
              type="text"
              autoComplete="street-address"
              className={inputCls}
              value={baseValues.address}
              onChange={(e) => onAddress(e.target.value)}
              placeholder={FIELD_GROUP_LABELS.address}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              {FIELD_GROUP_LABELS.postalCode}
            </label>
            <input
              type="text"
              autoComplete="postal-code"
              className={inputCls}
              value={baseValues.postalCode}
              onChange={(e) => onPostalCode(e.target.value)}
              placeholder={FIELD_GROUP_LABELS.postalCode}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              {FIELD_GROUP_LABELS.city}
            </label>
            <input
              type="text"
              autoComplete="address-level2"
              className={inputCls}
              value={baseValues.city}
              onChange={(e) => onCity(e.target.value)}
              placeholder={FIELD_GROUP_LABELS.city}
            />
          </div>
          {addressExtraFields.map((f) => {
            if (usedCustomKeys.has(f.key)) return null;
            usedCustomKeys.add(f.key);
            return (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
                <input
                  className={inputCls}
                  value={custom[f.key] ?? ""}
                  onChange={(e) => onCustom(f.key, e.target.value)}
                  placeholder={f.label}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-stone-200/80 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {FIELD_GROUP_LABELS.cvr}
        </h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="sr-only">{FIELD_GROUP_LABELS.cvr}</label>
            <input
              type="text"
              className={inputCls}
              value={baseValues.cvr}
              onChange={(e) => onCvr(e.target.value)}
              placeholder={FIELD_GROUP_LABELS.cvr}
            />
          </div>
          {(cfg.extensions.cvr ?? []).map((f) => {
            if (usedCustomKeys.has(f.key)) return null;
            usedCustomKeys.add(f.key);
            return (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
                <input
                  className={inputCls}
                  value={custom[f.key] ?? ""}
                  onChange={(e) => onCustom(f.key, e.target.value)}
                  placeholder={f.label}
                />
              </div>
            );
          })}

          <div className="border-t border-stone-100 pt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
              {FIELD_GROUP_LABELS.industry}
            </label>
            <input
              type="text"
              className={inputCls}
              value={baseValues.industry}
              onChange={(e) => onIndustry(e.target.value)}
              placeholder={FIELD_GROUP_LABELS.industry}
            />
          </div>
          {(cfg.extensions.industry ?? []).map((f) => {
            if (usedCustomKeys.has(f.key)) return null;
            usedCustomKeys.add(f.key);
            return (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
                <input
                  className={inputCls}
                  value={custom[f.key] ?? ""}
                  onChange={(e) => onCustom(f.key, e.target.value)}
                  placeholder={f.label}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
