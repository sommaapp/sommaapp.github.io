const assert = require('node:assert/strict');

const containsSensitiveText = value => {
  const text = String(value ?? '');
  const digits = text.replace(/\D/g, '');
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const hasCpf = /(?:^|\D)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?:\D|$)/.test(text);
  const hasCep = /(?:^|\D)\d{5}-?\d{3}(?:\D|$)/.test(text);
  const phoneMatch = text.match(/(?:^|\D)((?:\+55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9\d{4}|[2-5]\d{3})[\s.-]?\d{4})(?:\D|$)/);
  const phoneDigits = phoneMatch ? phoneMatch[1].replace(/\D/g, '') : '';
  const hasPhone = phoneDigits.length >= 10 && phoneDigits.length <= 11
    || Boolean(phoneMatch && /^\+55/.test(phoneMatch[1]) && phoneDigits.length >= 12 && phoneDigits.length <= 13);
  return hasEmail || hasCpf || hasCep || hasPhone;
};

const cases = [
  ['ordinary request text', 'Preciso de ajuda para transporte até o trabalho.', false],
  ['synthetic email', 'Contato teste@example.invalid', true],
  ['synthetic CPF-shaped value', 'Documento 123.456.789-00', true],
  ['synthetic CEP-shaped value', 'CEP 12345-678', true],
  ['synthetic mobile phone', 'Telefone (11) 91234-5678', true],
  ['synthetic landline', 'Telefone (11) 3234-5678', true],
  ['country-code phone', 'Telefone +55 11 91234-5678', true],
  ['12-digit protocol', 'Protocolo interno 202610201200', false],
  ['long numeric reference', 'Referência 987654321012345', false],
  ['currency amount', 'Meta de R$ 1.200,00 para transporte', false],
  ['ordinary date', 'Preciso até 20/10/2026', false],
  ['text containing multiple identifiers', 'Contato teste@example.invalid; CEP 12345-678', true],
  ['empty text', '', false]
];

for (const [name, input, expected] of cases) {
  assert.equal(containsSensitiveText(input), expected, name);
}

console.log('Sensitive-text pattern tests passed:', cases.length);
