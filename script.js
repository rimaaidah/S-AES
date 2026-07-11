const SBOX = [0x9,0x4,0xA,0xB,0xD,0x1,0x8,0x5,0x6,0x2,0x0,0x3,0xC,0xE,0xF,0x7];
const INV_SBOX = [0xA,0x5,0x9,0xB,0x1,0x7,0x8,0xF,0x6,0x0,0x2,0x3,0xC,0x4,0xD,0xE];
const RCON1 = 0x80;
const RCON2 = 0x30;
const MC = [[1,4],[4,1]];
const IMC = [[9,2],[2,9]];

const $ = (s) => document.querySelector(s);

function GFAdd(a,b){ return (a ^ b) & 0xF; }

function GFMul(a,b){
  let p = 0;
  let aa = a, bb = b;
  while (bb > 0) {
    if (bb & 1) p ^= aa;
    aa <<= 1;
    if (aa & 0x10) aa ^= 0x13;
    bb >>= 1;
  }
  return p & 0xF;
}

function toBits4(n){ return n.toString(2).padStart(4,"0"); }
function toBits8(n){ return n.toString(2).padStart(8,"0"); }
function toBits16(n){ return n.toString(2).padStart(16,"0"); }
function toHex(n){ return n.toString(16).toUpperCase(); }
function toHex16(n){ return "0x" + n.toString(16).toUpperCase().padStart(4,"0"); }
function validateBits16(v){ return /^[01]{16}$/.test(v); }
function bitsToInt(b){ return parseInt(b,2); }

function intToState(w){
  const n0 = (w >> 12) & 0xF;
  const n1 = (w >> 8) & 0xF;
  const n2 = (w >> 4) & 0xF;
  const n3 = w & 0xF;
  return [[n0,n2],[n1,n3]];
}

function stateToInt(s){
  return ((s[0][0] << 12) | (s[1][0] << 8) | (s[0][1] << 4) | s[1][1]) & 0xFFFF;
}

function cloneState(s){ return s.map(r => [...r]); }

function renderState(state, label=""){
  return `
    ${label ? `<p class="step-label">${label}</p>` : ""}
    <div class="matrix">
      ${state.flat().map(n => `
        <div class="cell">
          <span>${toBits4(n)}</span>
          <small>${toHex(n)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTable(title, rows){
  return `
    <details>
      <summary>${title}</summary>
      <div class="table-wrap">
        <table>${rows}</table>
      </div>
    </details>
  `;
}

function buildTables(){
  const sboxHead = `<tr><th>Input</th>${Array.from({length:16},(_,i)=>`<th>${toHex(i)}</th>`).join("")}</tr>`;
  const sboxOut = `<tr><th>Output</th>${SBOX.map(v=>`<td>${toHex(v)}</td>`).join("")}</tr>`;
  const invHead = `<tr><th>Input</th>${Array.from({length:16},(_,i)=>`<th>${toHex(i)}</th>`).join("")}</tr>`;
  const invOut = `<tr><th>Output</th>${INV_SBOX.map(v=>`<td>${toHex(v)}</td>`).join("")}</tr>`;
  const mixRows = `
    <tr><th>Komponen</th><th>Nilai</th></tr>
    <tr><td>MixColumns</td><td>|1 4|<br>|4 1|</td></tr>
    <tr><td>RCON1</td><td>1000 0000 (0x80)</td></tr>
    <tr><td>RCON2</td><td>0011 0000 (0x30)</td></tr>
    <tr><td>Inverse MixColumns</td><td>|9 2|<br>|2 9|</td></tr>
  `;
  $("#tablesArea").innerHTML =
    renderTable("S-Box", sboxHead + sboxOut) +
    renderTable("Inverse S-Box", invHead + invOut) +
    renderTable("MixColumns & RCON", mixRows);
}

function rotWord(x){ return ((x << 4) | (x >> 4)) & 0xFF; }
function subWord(x){ return ((SBOX[(x >> 4) & 0xF] << 4) | SBOX[x & 0xF]) & 0xFF; }

function keyExpansion(key16){
  const w0 = (key16 >> 8) & 0xFF;
  const w1 = key16 & 0xFF;
  const w2 = w0 ^ subWord(rotWord(w1)) ^ RCON1;
  const w3 = w2 ^ w1;
  const w4 = w2 ^ subWord(rotWord(w3)) ^ RCON2;
  const w5 = w4 ^ w3;
  return {
    w0,w1,w2,w3,w4,w5,
    K0: ((w0 << 8) | w1) & 0xFFFF,
    K1: ((w2 << 8) | w3) & 0xFFFF,
    K2: ((w4 << 8) | w5) & 0xFFFF
  };
}

function subNibbles(state, box){ return state.map(r => r.map(n => box[n])); }

function shiftRows(state){
  const s = cloneState(state);
  s[1] = [state[1][1], state[1][0]];
  return s;
}

function mixColumns(state, m){
  const a=state[0][0], b=state[1][0], c=state[0][1], d=state[1][1];
  return [
    [GFAdd(GFMul(m[0][0],a), GFMul(m[0][1],b)), GFAdd(GFMul(m[0][0],c), GFMul(m[0][1],d))],
    [GFAdd(GFMul(m[1][0],a), GFMul(m[1][1],b)), GFAdd(GFMul(m[1][0],c), GFMul(m[1][1],d))]
  ];
}

function addRoundKey(x,y){ return (x ^ y) & 0xFFFF; }

function encrypt(pt16, key16){
  const key = keyExpansion(key16);
  const steps = {};
  steps.key = key;
  steps.initial = addRoundKey(pt16, key.K0);
  let state = intToState(steps.initial);

  steps.round1 = {};
  steps.round1.beforeSub = cloneState(state);
  state = subNibbles(state, SBOX);
  steps.round1.afterSub = cloneState(state);

  steps.round1.beforeShift = cloneState(state);
  state = shiftRows(state);
  steps.round1.afterShift = cloneState(state);

  steps.round1.beforeMix = cloneState(state);
  state = mixColumns(state, MC);
  steps.round1.afterMix = cloneState(state);

  steps.round1.beforeARK = cloneState(state);
  let round1Int = addRoundKey(stateToInt(state), key.K1);
  state = intToState(round1Int);
  steps.round1.afterARK = cloneState(state);

  steps.round2 = {};
  steps.round2.beforeSub = cloneState(state);
  state = subNibbles(state, SBOX);
  steps.round2.afterSub = cloneState(state);

  steps.round2.beforeShift = cloneState(state);
  state = shiftRows(state);
  steps.round2.afterShift = cloneState(state);

  steps.final = addRoundKey(stateToInt(state), key.K2);
  return { key, steps };
}

function decrypt(ct16, key16){
  const key = keyExpansion(key16);
  let s = addRoundKey(ct16, key.K2);
  let state = intToState(s);

  state = shiftRows(state);
  state = subNibbles(state, INV_SBOX);
  s = stateToInt(state);

  s = addRoundKey(s, key.K1);
  state = intToState(s);

  state = mixColumns(state, IMC);
  state = shiftRows(state);
  state = subNibbles(state, INV_SBOX);
  s = stateToInt(state);

  s = addRoundKey(s, key.K0);
  return { key, result: s };
}

function keyExpansionHTML(key){
  return `
    <details open>
      <summary>Key Expansion</summary>
      <p>w0 = ${toBits8(key.w0)} (${toHex(key.w0)})</p>
      <p>w1 = ${toBits8(key.w1)} (${toHex(key.w1)})</p>
      <p>w2 = ${toBits8(key.w2)} (${toHex(key.w2)})</p>
      <p>w3 = ${toBits8(key.w3)} (${toHex(key.w3)})</p>
      <p>w4 = ${toBits8(key.w4)} (${toHex(key.w4)})</p>
      <p>w5 = ${toBits8(key.w5)} (${toHex(key.w5)})</p>
      <p>K0 = ${toBits16(key.K0)} (${toHex16(key.K0)})</p>
      <p>K1 = ${toBits16(key.K1)} (${toHex16(key.K1)})</p>
      <p>K2 = ${toBits16(key.K2)} (${toHex16(key.K2)})</p>
    </details>
  `;
}

function roundHTML(title, beforeState, afterState, subtitle){
  return `
    <details open>
      <summary>${title}</summary>
      <p>${subtitle}</p>
      ${renderState(beforeState, "Sebelum")}
      ${renderState(afterState, "Sesudah")}
    </details>
  `;
}

function buildEncryptSteps(data, msgInt){
  const k = data.key, s = data.steps;
  return `
    ${keyExpansionHTML(k)}
    <details open>
      <summary>Initial AddRoundKey</summary>
      <p>Plaintext XOR K0 menghasilkan state awal.</p>
      ${renderState(intToState(msgInt), "Plaintext")}
      ${renderState(intToState(s.initial), "Hasil XOR")}
    </details>
    ${roundHTML("Round 1 - SubNibbles", s.round1.beforeSub, s.round1.afterSub, "Substitusi setiap nibble menggunakan S-Box.")}
    ${roundHTML("Round 1 - ShiftRows", s.round1.beforeShift, s.round1.afterShift, "Baris kedua digeser satu nibble ke kiri.")}
    ${roundHTML("Round 1 - MixColumns", s.round1.beforeMix, s.round1.afterMix, "Perkalian matriks di GF(2^4).")}
    ${roundHTML("Round 1 - AddRoundKey", s.round1.beforeARK, s.round1.afterARK, "XOR hasil MixColumns dengan K1.")}
    ${roundHTML("Round 2 - SubNibbles", s.round2.beforeSub, s.round2.afterSub, "Substitusi nibble final round.")}
    ${roundHTML("Round 2 - ShiftRows", s.round2.beforeShift, s.round2.afterShift, "ShiftRows final round.")}
    <details open>
      <summary>Round 2 - AddRoundKey</summary>
      <p>Hasil akhir ciphertext setelah XOR dengan K2.</p>
      ${renderState(s.round2.afterShift, "Sebelum XOR K2")}
      ${renderState(intToState(s.final), "Ciphertext Akhir")}
    </details>
  `;
}

function buildDecryptSteps(key, resultInt){
  return `
    ${keyExpansionHTML(key)}
    <details open>
      <summary>Hasil Dekripsi</summary>
      ${renderState(intToState(resultInt), "Plaintext Akhir")}
    </details>
  `;
}

function updateResult(mode, outputInt){
  $("#binaryOutput").textContent = toBits16(outputInt);
  $("#hexOutput").textContent = toHex16(outputInt);
  $("#resultBox").className = "result success";
  $("#resultBox").textContent = mode === "encrypt" ? "Enkripsi berhasil diproses." : "Dekripsi berhasil diproses.";
}

function initTheme(){
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.dataset.theme = saved === "dark" ? "dark" : "";
  $("#themeToggle").textContent = saved === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode";
  $("#themeToggle").setAttribute("aria-pressed", String(saved === "dark"));
}

$("#themeToggle").addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = isDark ? "" : "dark";
  localStorage.setItem("theme", isDark ? "light" : "dark");
  $("#themeToggle").textContent = isDark ? "🌙 Dark Mode" : "☀️ Light Mode";
  $("#themeToggle").setAttribute("aria-pressed", String(!isDark));
});

$("#message").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/[^01]/g, "").slice(0,16);
});

$("#key").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/[^01]/g, "").slice(0,16);
});

$("#resetBtn").addEventListener("click", () => {
  $("#errorBox").textContent = "";
  $("#resultBox").className = "result empty";
  $("#resultBox").textContent = "Belum ada proses.";
  $("#binaryOutput").textContent = "-";
  $("#hexOutput").textContent = "-";
  $("#stepsArea").innerHTML = "";
});

$("#saesForm").addEventListener("submit", e => {
  e.preventDefault();
  const message = $("#message").value.trim();
  const key = $("#key").value.trim();
  const mode = document.querySelector('input[name="mode"]:checked').value;

  if (!validateBits16(message) || !validateBits16(key)) {
    $("#errorBox").textContent = "Input harus tepat 16 bit dan hanya berisi 0/1.";
    return;
  }

  $("#errorBox").textContent = "";
  const msgInt = bitsToInt(message);
  const keyInt = bitsToInt(key);

  if (mode === "encrypt") {
    const data = encrypt(msgInt, keyInt);
    updateResult("encrypt", data.steps.final);
    $("#stepsArea").innerHTML = buildEncryptSteps(data, msgInt);
  } else {
    const data = decrypt(msgInt, keyInt);
    updateResult("decrypt", data.result);
    $("#stepsArea").innerHTML = buildDecryptSteps(data.key, data.result);
  }
});

buildTables();
initTheme();