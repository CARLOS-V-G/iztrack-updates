import { Product, ScannerConfig } from "./types";

export interface ScaleBarcodeResult {
  code: string;
  amount: number;
  rawAmount: number;
  label: string;
  plu: string;
  product?: Product;
  truncatedAmount?: boolean;
  estimatedWeightKg?: number;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  barcode_prefix: "2",
  plu_start: 1,
  plu_length: 5,
  amount_start: 6,
  amount_length: 6,
  amount_divisor: 1,
  auto_open_sale: true,
  bring_to_front: true,
  play_sound: true,
  default_payment_method: "",
  max_char_interval: 50,
  min_code_length: 3,
  detect_truncated_amount: true,
};

// El campo "importe" del codigo EAN-13 de balanza tiene un ancho fijo
// (normalmente 6 digitos). Si el precio real supera ese limite, la balanza
// lo trunca por desborde (modulo) antes de imprimir el codigo de barras.
// Ej: $12.285,50 -> el campo de 6 digitos solo guarda "228550" -> $2.285,50.
//
// Cuando hay un precio por kg configurado para el PLU, podemos detectar este
// desborde: si el peso implicito (importe / precio_por_kg) da algo
// fisicamente imposible (unos pocos gramos), probamos sumar "vueltas"
// completas del campo hasta encontrar un peso plausible.
const MIN_PLAUSIBLE_WEIGHT_KG = 0.01;
const MAX_PLAUSIBLE_WEIGHT_KG = 100;
const MAX_WRAP_ATTEMPTS = 9;

export function isValidEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;

  const digits = code.split("").map(Number);
  const checkDigit = digits[12];
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;

  return checkDigit === expected;
}

export function normalizeBarcodeDigits(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "");
  return digits.length > 13 ? digits.slice(-13) : digits;
}

export function parseScaleBarcode(
  rawValue: string,
  config: ScannerConfig = DEFAULT_SCANNER_CONFIG,
  products: Product[] = [],
): ScaleBarcodeResult | null {
  const code = normalizeBarcodeDigits(rawValue);
  const mergedConfig = { ...DEFAULT_SCANNER_CONFIG, ...config };

  if (!code.startsWith(mergedConfig.barcode_prefix) || !isValidEan13(code)) return null;

  const plu = code.slice(
    mergedConfig.plu_start,
    mergedConfig.plu_start + mergedConfig.plu_length,
  );
  const rawAmountStr = code.slice(
    mergedConfig.amount_start,
    mergedConfig.amount_start + mergedConfig.amount_length,
  );
  const rawAmount = Number(rawAmountStr) / mergedConfig.amount_divisor;

  if (!plu || !Number.isFinite(rawAmount) || rawAmount <= 0) return null;

  const plu6 = plu.padStart(6, "0");
  const product = products.find((item) => item.active !== false && item.plu === plu6);

  let amount = rawAmount;
  let truncatedAmount = false;
  let estimatedWeightKg: number | undefined;

  if (
    mergedConfig.detect_truncated_amount !== false &&
    product?.price_per_kg &&
    product.price_per_kg > 0
  ) {
    const impliedWeight = rawAmount / product.price_per_kg;
    estimatedWeightKg = impliedWeight;

    if (impliedWeight < MIN_PLAUSIBLE_WEIGHT_KG) {
      const wrapModulus = 10 ** mergedConfig.amount_length / mergedConfig.amount_divisor;
      for (let attempt = 1; attempt <= MAX_WRAP_ATTEMPTS; attempt++) {
        const candidateAmount = rawAmount + attempt * wrapModulus;
        const candidateWeight = candidateAmount / product.price_per_kg;
        if (candidateWeight >= MIN_PLAUSIBLE_WEIGHT_KG && candidateWeight <= MAX_PLAUSIBLE_WEIGHT_KG) {
          amount = candidateAmount;
          estimatedWeightKg = candidateWeight;
          truncatedAmount = true;
          break;
        }
      }
    }
  }

  return {
    code,
    amount,
    rawAmount,
    label: product ? `${product.name} (PLU ${plu})` : `PLU ${plu}`,
    plu,
    product,
    truncatedAmount,
    estimatedWeightKg,
  };
}

export function getScaleBarcodeError(rawValue: string, config: ScannerConfig = DEFAULT_SCANNER_CONFIG) {
  const code = normalizeBarcodeDigits(rawValue);
  const mergedConfig = { ...DEFAULT_SCANNER_CONFIG, ...config };

  if (/^1\d{12}$/.test(code)) {
    return `El codigo ${code} es el codigo del comprobante y no trae el importe. Escanea el codigo del producto que empieza con ${mergedConfig.barcode_prefix}.`;
  }

  if (/^\d{13}$/.test(code) && !isValidEan13(code)) {
    return `El codigo ${code} no paso la validacion EAN-13. Volve a escanear apuntando al codigo completo.`;
  }

  if (!code.startsWith(mergedConfig.barcode_prefix)) {
    return `El codigo ${code || rawValue} no coincide con la configuracion de balanza. Tiene que empezar con ${mergedConfig.barcode_prefix}.`;
  }

  return `No pude leer el importe del codigo ${code}. Revisa la configuracion del escaner o escanea nuevamente.`;
}
