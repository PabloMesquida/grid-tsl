import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

// -------------------------
// Funciones TSL 
// -------------------------

const computeMask = TSL.Fn(({ uv, lineWidth, cellSize, uvDeriv }) => {
    const uvDerivGrid = uvDeriv.div( TSL.vec2(cellSize) );
    const lwCells = TSL.vec2(lineWidth).div( TSL.vec2(cellSize) );
    const invertLine = lwCells.greaterThan(TSL.float(0.5));
    const targetWidth = TSL.select(invertLine, TSL.vec2(1.0).sub(lwCells), lwCells);
    const drawWidth = TSL.clamp(targetWidth, uvDerivGrid, TSL.vec2(TSL.float(0.5)));
    const lineAA = uvDerivGrid.mul(TSL.float(1.5));
    let gridUV = TSL.fract( uv.div( TSL.vec2(cellSize) ) ).mul(TSL.float(2.0)).sub(TSL.float(1.0)).abs();
    gridUV = TSL.select(invertLine, gridUV, TSL.vec2(1.0).sub(gridUV));
    let grid2 = TSL.smoothstep( drawWidth.add(lineAA), drawWidth.sub(lineAA), gridUV );
    grid2 = TSL.vec2(grid2);
    grid2 = grid2.mul( TSL.saturate( targetWidth.div(drawWidth) ) );
    const t = TSL.saturate( uvDerivGrid.mul(TSL.float(2.0)).sub(TSL.float(1.0)) );
    grid2 = TSL.mix(grid2, targetWidth, t);
    grid2 = TSL.select(invertLine, TSL.vec2(1.0).sub(grid2), grid2);
    const mask = TSL.mix( grid2.x, TSL.float(1.0), grid2.y );
    return mask;
});

const computePlusMask = TSL.Fn(({ uv, lineWidth, cellSize, segmentLen, uvDeriv }) => {
  const uvDerivGrid = uvDeriv.div( TSL.vec2(cellSize) );
  const lwVec = TSL.vec2(lineWidth).div( TSL.vec2(cellSize) );
  const drawWidth = TSL.clamp(lwVec, uvDerivGrid, TSL.vec2(TSL.float(0.5)));
  const lineAA = uvDerivGrid.mul(TSL.float(1.5));
  const cell = TSL.fract( uv.div( TSL.vec2(cellSize) ) );
  const tri = TSL.vec2(1.0).sub( cell.mul(TSL.float(2.0)).sub(TSL.float(1.0)).abs() );
  const gridUV = cell.mul(TSL.float(2.0)).sub(TSL.float(1.0)).abs();
  const smoothEdges = TSL.smoothstep( drawWidth.sub(lineAA), drawWidth.add(lineAA), gridUV );
  const lineMaskVec = TSL.vec2(1.0).sub( smoothEdges );
  // const seg = TSL.float(segmentLen);
  const seg = segmentLen.div( TSL.float(1.0).mul(cellSize) )
  const segAA = uvDerivGrid.mul(TSL.float(0.5)).x.add( uvDerivGrid.mul(TSL.float(0.5)).y ).mul(TSL.float(0.5));
  const segEdge0 = seg.sub(segAA);
  const segEdge1 = seg.add(segAA);
  const selectorY = TSL.smoothstep(segEdge0, segEdge1, tri.y);
  const selectorX = TSL.smoothstep(segEdge0, segEdge1, tri.x);
  const verticalArm   = lineMaskVec.x.mul( selectorY );
  const horizontalArm = lineMaskVec.y.mul( selectorX );
  const plusMask = TSL.saturate( verticalArm.add(horizontalArm) );
  return plusMask;
});

// -------------------------
// Presets
// -------------------------

export const GridPresets = {
  default: {
    cellSizeA: 10.0, lineWidthA: 0.05, colorA: '#ae7100', 
    cellSizeB: 2.0,  lineWidthB: 0.002, colorB: '#0046d2', 
    cellSizeC: 1.0,  lineWidthC: 0.0275, colorC: '#700000', segmentLen: 0.9, 
    bgColor: '#0b0b0b'
  },

  // 1. Blanco y Negro (alto contraste)
  contrast: {
    cellSizeA: 10.0, lineWidthA: 0.06, colorA: '#ffffff', 
    cellSizeB: 1.0,  lineWidthB: 0.004, colorB: '#ffffff', 
    cellSizeC: 0,  lineWidthC: 0.02, colorC: '#808080', segmentLen: 0.9, 
    bgColor: '#000000'
  },

  // 2. Modo oscuro (sutil)
  dark: {
    cellSizeA: 10.0, lineWidthA: 0.04, colorA: '#2ecc71', 
    cellSizeB: 1.0,  lineWidthB: 0.003, colorB: '#3498db', 
    cellSizeC: 2.0,  lineWidthC: 0.03, colorC: '#3498db', segmentLen: 1.9, 
    bgColor: '#0b1220'
  },

  // 3. Modo claro (clean / subtle)
  light: {
    cellSizeA: 10.0, lineWidthA: 0.04, colorA: '#6777ac', 
    cellSizeB: 1.0,  lineWidthB: 0.005, colorB: '#6777ac', 
    cellSizeC: 2.0,  lineWidthC: 0.03, colorC: '#6777ac', segmentLen: 1.9, 
    bgColor: '#c0c8cf'
  },

  // 4. Blueprint (estilo plano técnico, azules)
  blueprint: {
    cellSizeA: 8.0, lineWidthA: 0.03, colorA: '#008897', 
    cellSizeB: 1.0, lineWidthB: 0.002, colorB: '#0077cc', 
    cellSizeC: 1.0, lineWidthC: 0.01, colorC: '#00477a', segmentLen: 0.9, 
    bgColor: '#001026'
  },

  // 5. Retro 
  retro: {
    cellSizeA: 10.0, lineWidthA: 0.06, colorA: '#ffb86b',
    cellSizeB: 1.0,  lineWidthB: 0.005, colorB: '#7a3f12', 
    cellSizeC: 0,  lineWidthC: 0.03, colorC: '#d35400', segmentLen: 0.85,
    bgColor: '#2b1b10'
  },

  // 6. Neon (colores saturados)
  neon: {
    cellSizeA: 10.0,  lineWidthA: 0.045, colorA: '#39ff14', 
    cellSizeB: 2.0,  lineWidthB: 0.0035, colorB: '#ff00cc', 
    cellSizeC: 1.0,  lineWidthC: 0.03, colorC: '#00ffff', segmentLen: 0.9, 
    bgColor: '#04040a'
  },

  // 7. Funky (colores vivos y contraste)
  funky: {
    cellSizeA: 8.0,  lineWidthA: 0.06, colorA: '#ffff00',
    cellSizeB: 1.0,  lineWidthB: 0.02, colorB: '#ff00ff',
    cellSizeC: 1.0,  lineWidthC: 0.03, colorC: '#00ffff', segmentLen: 0.9,
    bgColor: '#2a002a'
  },
}; 

export const GridStyles = Object.keys(GridPresets);

// -------------------------
// Clase principal
// -------------------------


export class GridNodeMaterial extends THREE.NodeMaterial {

  static get type() { return 'GridNodeMaterial'; }

  constructor(params = {}) {
    super();
    this.isGridNodeMaterial = true;

    // Merge con preset default
    const finalParams = { ...GridPresets.default, ...params };

    // Definimos uniforms internos (privados)
    this._cellSizeA = TSL.uniform(finalParams.cellSizeA);
    this._lineWidthA = TSL.uniform(finalParams.lineWidthA);
    this._colorA = TSL.uniform(new THREE.Color(finalParams.colorA));

    this._cellSizeB = TSL.uniform(finalParams.cellSizeB);
    this._lineWidthB = TSL.uniform(finalParams.lineWidthB);
    this._colorB = TSL.uniform(new THREE.Color(finalParams.colorB));

    this._cellSizeC = TSL.uniform(finalParams.cellSizeC);
    this._lineWidthC = TSL.uniform(finalParams.lineWidthC);
    this._colorC = TSL.uniform(new THREE.Color(finalParams.colorC));
    this._segmentLen = TSL.uniform(finalParams.segmentLen);

    this._bgColor = TSL.uniform(new THREE.Color(finalParams.bgColor));

    // Fragment node
    const uv = TSL.positionWorld.xz;
    const ddxUV = TSL.dFdx(uv);
    const ddyUV = TSL.dFdy(uv);
    const uvDeriv = TSL.vec2(
      TSL.length(TSL.vec2(ddxUV.x, ddyUV.x)),
      TSL.length(TSL.vec2(ddxUV.y, ddyUV.y))
    );

    const maskA = computeMask({ uv, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv });
    const maskB = computeMask({ uv, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv });
    const maskC = computePlusMask({ uv, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv });

        const one = TSL.float(1.0);

        // aseguramos rangos [0,1]
        const mA = TSL.saturate(maskA);
        const mB = TSL.saturate(maskB);
        const mC = TSL.saturate(maskC);

        // máscara B solo donde no hay A
        const mB_eff = TSL.saturate( mB.mul( one.sub(mA) ) );

        // máscara C solo donde no hay A ni B_eff
        const mC_eff = TSL.saturate( mC.mul( one.sub(mA) ).mul( one.sub(mB_eff) ) );

        // fondo solo donde ninguna máscara cubre
        const total = mA.add(mB_eff).add(mC_eff);
        const bgWeight = TSL.saturate( one.sub(total) );

        // combinación sin mezcla entre capas
        const out = TSL.clamp(
        this._bgColor.mul(bgWeight)
            .add( this._colorA.mul(mA) )
            .add( this._colorB.mul(mB_eff) )
            .add( this._colorC.mul(mC_eff) ),
        TSL.vec3(0.0),
        TSL.vec3(1.0)
        );

        this.colorNode = out;
        this.alphaNode = TSL.float(1.0);
  }

  // Getters/setters estilo property

  get cellSizeA() { return this._cellSizeA.value; }
  set cellSizeA(v) { this._cellSizeA.value = v; }

  get lineWidthA() { return this._lineWidthA.value; }
  set lineWidthA(v) { this._lineWidthA.value = v; }

  get colorA() { return this._colorA.value; }
  set colorA(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorA.value.set(v);
    else this._colorA.value.copy(v);
  }

  get cellSizeB() { return this._cellSizeB.value; }
  set cellSizeB(v) { this._cellSizeB.value = v; }

  get lineWidthB() { return this._lineWidthB.value; }
  set lineWidthB(v) { this._lineWidthB.value = v; }

  get colorB() { return this._colorB.value; }
  set colorB(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorB.value.set(v);
    else this._colorB.value.copy(v);
  }

  get cellSizeC() { return this._cellSizeC.value; }
  set cellSizeC(v) { this._cellSizeC.value = v; }

  get lineWidthC() { return this._lineWidthC.value; }
  set lineWidthC(v) { this._lineWidthC.value = v; }

  get colorC() { return this._colorC.value; }
  set colorC(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorC.value.set(v);
    else this._colorC.value.copy(v);
  }

  get segmentLen() { return this._segmentLen.value; }
  set segmentLen(v) { this._segmentLen.value = v; }

  get bgColor() { return this._bgColor.value; }
  set bgColor(v) {
    if (typeof v === 'string' || typeof v === 'number') this._bgColor.value.set(v);
    else this._bgColor.value.copy(v);
  }

  // Factory estática estilo WoodNodeMaterial
  static fromPreset(style = 'default', overrides = {}) {
    const preset = GridPresets[style] || GridPresets.default;
    return new GridNodeMaterial({ ...preset, ...overrides });
  }
}

export class GridTriplanarNodeMaterial extends THREE.NodeMaterial {

  static get type() { return 'GridTriplanarNodeMaterial'; }

  constructor(params = {}) {
    super();
    this.isGridTriplanarNodeMaterial = true;

    const finalParams = { ...GridPresets.default, ...params };

    // --- Uniforms ---
    this._cellSizeA = TSL.uniform(finalParams.cellSizeA);
    this._lineWidthA = TSL.uniform(finalParams.lineWidthA);
    this._colorA = TSL.uniform(new THREE.Color(finalParams.colorA));

    this._cellSizeB = TSL.uniform(finalParams.cellSizeB);
    this._lineWidthB = TSL.uniform(finalParams.lineWidthB);
    this._colorB = TSL.uniform(new THREE.Color(finalParams.colorB));

    this._cellSizeC = TSL.uniform(finalParams.cellSizeC);
    this._lineWidthC = TSL.uniform(finalParams.lineWidthC);
    this._colorC = TSL.uniform(new THREE.Color(finalParams.colorC));
    this._segmentLen = TSL.uniform(finalParams.segmentLen);

    this._bgColor = TSL.uniform(new THREE.Color(finalParams.bgColor));

    this._uvScaleX = TSL.uniform(new THREE.Vector2(1.0, 1.0));
    this._uvScaleY = TSL.uniform(new THREE.Vector2(1.0, 1.0)); 
    this._uvScaleZ = TSL.uniform(new THREE.Vector2(1.0, 1.0));

    // --- Triplanar UVs ---
    const posW = TSL.positionLocal;
    const nW = TSL.normalLocal;

    // Construimos las UVs proyectadas (cada proyección usa dos componentes del espacio mundo)
    const uvX = TSL.vec2(posW.y, posW.z).mul( TSL.vec2(this._uvScaleX.value.x, this._uvScaleX.value.y) );
    const uvY = TSL.vec2(posW.x, posW.z).mul( TSL.vec2(this._uvScaleY.value.x, this._uvScaleY.value.y) );
    const uvZ = TSL.vec2(posW.x, posW.y).mul( TSL.vec2(this._uvScaleZ.value.x, this._uvScaleZ.value.y) );

    // derivadas para cada uv (para AA correcto)
    const ddxX = TSL.dFdx(uvX), ddyX = TSL.dFdy(uvX);
    const uvDerivX = TSL.vec2(
      TSL.length(TSL.vec2(ddxX.x, ddyX.x)),
      TSL.length(TSL.vec2(ddxX.y, ddyX.y))
    );
    
    const ddxY = TSL.dFdx(uvY), ddyY = TSL.dFdy(uvY);
    const uvDerivY = TSL.vec2(
      TSL.length(TSL.vec2(ddxY.x, ddyY.x)),
      TSL.length(TSL.vec2(ddxY.y, ddyY.y))
    );
    
    const ddxZ = TSL.dFdx(uvZ), ddyZ = TSL.dFdy(uvZ);
    const uvDerivZ = TSL.vec2(
      TSL.length(TSL.vec2(ddxZ.x, ddyZ.x)),
      TSL.length(TSL.vec2(ddxZ.y, ddyZ.y))
    );

    // Masks A
    const maskA_X = computeMask({ uv: uvX, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv: uvDerivX });
    const maskA_Y = computeMask({ uv: uvY, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv: uvDerivY });
    const maskA_Z = computeMask({ uv: uvZ, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv: uvDerivZ });

    // Masks B
    const maskB_X = computeMask({ uv: uvX, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv: uvDerivX });
    const maskB_Y = computeMask({ uv: uvY, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv: uvDerivY });
    const maskB_Z = computeMask({ uv: uvZ, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv: uvDerivZ });

    // Masks C
    const maskC_X = computePlusMask({ uv: uvX, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv: uvDerivX });
    const maskC_Y = computePlusMask({ uv: uvY, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv: uvDerivY });
    const maskC_Z = computePlusMask({ uv: uvZ, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv: uvDerivZ });

    // Pesos triplanar
    const w = TSL.abs(nW);
    const sum = w.x.add(w.y).add(w.z);
    const weight = TSL.vec3(w.x.div(sum), w.y.div(sum), w.z.div(sum));

    // Combinar máscaras
    const maskA = maskA_X.mul(weight.x).add(maskA_Y.mul(weight.y)).add(maskA_Z.mul(weight.z));
    const maskB = maskB_X.mul(weight.x).add(maskB_Y.mul(weight.y)).add(maskB_Z.mul(weight.z));
    const maskC = maskC_X.mul(weight.x).add(maskC_Y.mul(weight.y)).add(maskC_Z.mul(weight.z));

    // Post-proceso de capas
    const one = TSL.float(1.0);
    const mA = TSL.saturate(maskA);
    const mB = TSL.saturate(maskB.mul(one.sub(mA)));
    const mC = TSL.saturate(maskC.mul(one.sub(mA)).mul(one.sub(mB)));
    const total = mA.add(mB).add(mC);
    const bgWeight = TSL.saturate(one.sub(total));

    // Composición final
    const out = TSL.clamp(
      this._bgColor.mul(bgWeight)
        .add(this._colorA.mul(mA))
        .add(this._colorB.mul(mB))
        .add(this._colorC.mul(mC)),
      TSL.vec3(0.0),
      TSL.vec3(1.0)
    );

    this.colorNode = out;
    this.alphaNode = TSL.float(1.0);
  }

  // --- Getters / Setters ---
  get cellSizeA() { return this._cellSizeA.value; }
  set cellSizeA(v) { this._cellSizeA.value = v; }

  get lineWidthA() { return this._lineWidthA.value; }
  set lineWidthA(v) { this._lineWidthA.value = v; }

  get colorA() { return this._colorA.value; }
  set colorA(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorA.value.set(v);
    else this._colorA.value.copy(v);
  }

  get cellSizeB() { return this._cellSizeB.value; }
  set cellSizeB(v) { this._cellSizeB.value = v; }

  get lineWidthB() { return this._lineWidthB.value; }
  set lineWidthB(v) { this._lineWidthB.value = v; }

  get colorB() { return this._colorB.value; }
  set colorB(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorB.value.set(v);
    else this._colorB.value.copy(v);
  }

  get cellSizeC() { return this._cellSizeC.value; }
  set cellSizeC(v) { this._cellSizeC.value = v; }

  get lineWidthC() { return this._lineWidthC.value; }
  set lineWidthC(v) { this._lineWidthC.value = v; }

  get colorC() { return this._colorC.value; }
  set colorC(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorC.value.set(v);
    else this._colorC.value.copy(v);
  }

  get segmentLen() { return this._segmentLen.value; }
  set segmentLen(v) { this._segmentLen.value = v; }

  get bgColor() { return this._bgColor.value; }
  set bgColor(v) {
    if (typeof v === 'string' || typeof v === 'number') this._bgColor.value.set(v);
    else this._bgColor.value.copy(v);
  }

  // --- Factory estática ---
  static fromPreset(style = 'default', overrides = {}) {
    const preset = GridPresets[style] || GridPresets.default;
    return new GridTriplanarNodeMaterial({ ...preset, ...overrides });
  }
}


export class GridGeoUVNodeMaterial extends THREE.NodeMaterial {

  static get type() { return 'GridGeoUVNodeMaterial'; }

  constructor(params = {}) {
    super();
    this.isGridGeoUVNodeMaterial = true;

    const finalParams = { ...GridPresets.default, ...params };

    // --- Uniforms ---
    this._cellSizeA = TSL.uniform(finalParams.cellSizeA);
    this._lineWidthA = TSL.uniform(finalParams.lineWidthA);
    this._colorA = TSL.uniform(new THREE.Color(finalParams.colorA));

    this._cellSizeB = TSL.uniform(finalParams.cellSizeB);
    this._lineWidthB = TSL.uniform(finalParams.lineWidthB);
    this._colorB = TSL.uniform(new THREE.Color(finalParams.colorB));

    this._cellSizeC = TSL.uniform(finalParams.cellSizeC);
    this._lineWidthC = TSL.uniform(finalParams.lineWidthC);
    this._colorC = TSL.uniform(new THREE.Color(finalParams.colorC));
    this._segmentLen = TSL.uniform(finalParams.segmentLen);

    this._bgColor = TSL.uniform(new THREE.Color(finalParams.bgColor));

    this._uvScaleX = TSL.uniform(new THREE.Vector2(1.0, 1.0));
    this._uvScaleY = TSL.uniform(new THREE.Vector2(1.0, 1.0)); 
    this._uvScaleZ = TSL.uniform(new THREE.Vector2(1.0, 1.0));

    // --- UVs de la geometría ---
    let uv = TSL.uv();
    const ddxUV = TSL.dFdx(uv);
    const ddyUV = TSL.dFdy(uv);
    const uvDeriv = TSL.vec2(
      TSL.length(TSL.vec2(ddxUV.x, ddyUV.x)),
      TSL.length(TSL.vec2(ddxUV.y, ddyUV.y))
    );

    const maskA = computeMask({ uv, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv });
    const maskB = computeMask({ uv, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv });
    const maskC = computePlusMask({ uv, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv });



    // // Masks
    // const maskA = computeMask({ uv: geoUV, lineWidth: this._lineWidthA, cellSize: this._cellSizeA, uvDeriv });
    // const maskB = computeMask({ uv: geoUV, lineWidth: this._lineWidthB, cellSize: this._cellSizeB, uvDeriv });
    // const maskC = computePlusMask({ uv: geoUV, lineWidth: this._lineWidthC, cellSize: this._cellSizeC, segmentLen: this._segmentLen, uvDeriv });

    // Post-proceso de capas
    const one = TSL.float(1.0);
    const mA = TSL.saturate(maskA);
    const mB = TSL.saturate(maskB.mul(one.sub(mA)));
    const mC = TSL.saturate(maskC.mul(one.sub(mA)).mul(one.sub(mB)));
    const total = mA.add(mB).add(mC);
    const bgWeight = TSL.saturate(one.sub(total));

    // Composición final
    const out = TSL.clamp(
      this._bgColor.mul(bgWeight)
        .add(this._colorA.mul(mA))
        .add(this._colorB.mul(mB))
        .add(this._colorC.mul(mC)),
      TSL.vec3(0.0),
      TSL.vec3(1.0)
    );

    this.colorNode = out;
    this.alphaNode = TSL.float(1.0);
  }

  // --- Getters / Setters ---
  get cellSizeA() { return this._cellSizeA.value; }
  set cellSizeA(v) { this._cellSizeA.value = v; }

  get lineWidthA() { return this._lineWidthA.value; }
  set lineWidthA(v) { this._lineWidthA.value = v; }

  get colorA() { return this._colorA.value; }
  set colorA(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorA.value.set(v);
    else this._colorA.value.copy(v);
  }

  get cellSizeB() { return this._cellSizeB.value; }
  set cellSizeB(v) { this._cellSizeB.value = v; }

  get lineWidthB() { return this._lineWidthB.value; }
  set lineWidthB(v) { this._lineWidthB.value = v; }

  get colorB() { return this._colorB.value; }
  set colorB(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorB.value.set(v);
    else this._colorB.value.copy(v);
  }

  get cellSizeC() { return this._cellSizeC.value; }
  set cellSizeC(v) { this._cellSizeC.value = v; }

  get lineWidthC() { return this._lineWidthC.value; }
  set lineWidthC(v) { this._lineWidthC.value = v; }

  get colorC() { return this._colorC.value; }
  set colorC(v) {
    if (typeof v === 'string' || typeof v === 'number') this._colorC.value.set(v);
    else this._colorC.value.copy(v);
  }

  get segmentLen() { return this._segmentLen.value; }
  set segmentLen(v) { this._segmentLen.value = v; }

  get bgColor() { return this._bgColor.value; }
  set bgColor(v) {
    if (typeof v === 'string' || typeof v === 'number') this._bgColor.value.set(v);
    else this._bgColor.value.copy(v);
  }

  // --- Factory estática ---
  static fromPreset(style = 'default', overrides = {}) {
    const preset = GridPresets[style] || GridPresets.default;
    return new GridGeoUVNodeMaterial({ ...preset, ...overrides });
  }
}
