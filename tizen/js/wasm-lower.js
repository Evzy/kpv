/**
 * Lowers WebAssembly modules that use reference types (externref) so they compile on
 * Chromium 76 (Tizen 6): externref values become i32 handles into a JS array, and
 * externref tables move to JS behind imported helper functions. Imports and exports
 * are wrapped so JS callers still see real JS values.
 */
const WasmLower = (() => {
  const EXTERN = 0x6f;
  const FUNCREF = 0x70;
  const I32 = 0x7f;
  const HELPER_MODULE = "__kpv_ref";
  const HELPERS = ["tget", "tset", "tgrow", "tsize", "tfill"];
  /** Callers may patch WebAssembly.instantiate to route modules through here; never re-enter it. */
  const nativeInstantiate =
    typeof WebAssembly !== "undefined" ? WebAssembly.instantiate.bind(WebAssembly) : null;

  class Reader {
    constructor(bytes, pos) {
      this.b = bytes;
      this.p = pos || 0;
    }

    u8() {
      return this.b[this.p++];
    }

    u32() {
      let r = 0;
      let s = 0;
      let x;
      do {
        x = this.b[this.p++];
        r += (x & 0x7f) * 2 ** s;
        s += 7;
      } while (x & 0x80);
      return r;
    }

    skipLeb() {
      while (this.b[this.p++] & 0x80) {
        /* continuation byte */
      }
    }

    name() {
      const n = this.u32();
      const s = utf8Decode(this.b.subarray(this.p, this.p + n));
      this.p += n;
      return s;
    }
  }

  class Writer {
    constructor() {
      this.a = [];
    }

    byte(x) {
      this.a.push(x);
    }

    bytes(arr) {
      for (let i = 0; i < arr.length; i++) this.a.push(arr[i]);
    }

    u32(n) {
      do {
        let b = n % 128;
        n = Math.floor(n / 128);
        if (n) b |= 0x80;
        this.a.push(b);
      } while (n);
    }

    name(s) {
      const e = utf8Encode(s);
      this.u32(e.length);
      this.bytes(e);
    }

    section(id, body) {
      this.byte(id);
      this.u32(body.a.length);
      this.bytes(body.a);
    }
  }

  function utf8Encode(s) {
    return new TextEncoder().encode(s);
  }

  function utf8Decode(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function lowerValType(t) {
    if (t === EXTERN) return I32;
    if (t === FUNCREF) throw new Error("funcref values are not supported");
    return t;
  }

  /** Skip an init expression (constant expression ending in 0x0b), rewriting ref.null extern. */
  function copyInitExpr(r, w) {
    for (;;) {
      const op = r.u8();
      if (op === 0x0b) {
        w.byte(0x0b);
        return;
      }
      if (op === 0xd0) {
        const ht = r.u8();
        if (ht !== EXTERN) throw new Error("ref.null funcref in init expr is not supported");
        w.byte(0x41);
        w.byte(0x00);
      } else if (op === 0x41 || op === 0x42) {
        const start = r.p;
        r.skipLeb();
        w.byte(op);
        w.bytes(r.b.subarray(start, r.p));
      } else if (op === 0x43) {
        w.byte(op);
        w.bytes(r.b.subarray(r.p, r.p + 4));
        r.p += 4;
      } else if (op === 0x44) {
        w.byte(op);
        w.bytes(r.b.subarray(r.p, r.p + 8));
        r.p += 8;
      } else if (op === 0x23) {
        w.byte(op);
        w.u32(r.u32());
      } else {
        throw new Error(`unsupported init expr opcode 0x${op.toString(16)}`);
      }
    }
  }

  function readSections(bytes) {
    if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
      throw new Error("not a wasm module");
    }
    const r = new Reader(bytes, 8);
    const sections = [];
    while (r.p < bytes.length) {
      const id = r.u8();
      const size = r.u32();
      sections.push({ id, body: bytes.subarray(r.p, r.p + size) });
      r.p += size;
    }
    return sections;
  }

  /**
   * @param {Uint8Array} bytes original module
   * @returns {{ bytes: Uint8Array, meta: object }}
   */
  function lower(bytes) {
    const sections = readSections(bytes);
    const meta = {
      types: [],
      funcImports: [],
      funcTypes: [],
      exports: [],
      externTables: [],
      helperCount: 0,
    };
    /** Table index space: { extern: bool, min, max, newIndex } */
    const tables = [];
    let numFuncImports = 0;

    // Pass 1: collect types, imports, tables so code rewriting knows the index spaces.
    for (const s of sections) {
      const r = new Reader(s.body);
      if (s.id === 1) {
        const n = r.u32();
        for (let i = 0; i < n; i++) {
          if (r.u8() !== 0x60) throw new Error("unsupported type form");
          const params = [];
          const results = [];
          const pc = r.u32();
          for (let j = 0; j < pc; j++) params.push(r.u8());
          const rc = r.u32();
          for (let j = 0; j < rc; j++) results.push(r.u8());
          if (results.length > 1) throw new Error("multi-value results are not supported");
          meta.types.push({ params, results });
        }
      } else if (s.id === 2) {
        const n = r.u32();
        for (let i = 0; i < n; i++) {
          const module = r.name();
          const name = r.name();
          const kind = r.u8();
          if (kind === 0) {
            const typeIndex = r.u32();
            meta.funcImports.push({ module, name, typeIndex });
            meta.funcTypes.push(typeIndex);
            numFuncImports++;
          } else if (kind === 1) {
            const et = r.u8();
            if (et === EXTERN) throw new Error("imported externref tables are not supported");
            const fl = r.u8();
            const min = r.u32();
            if (fl & 1) r.u32();
            tables.push({ extern: false, min });
          } else if (kind === 2) {
            const fl = r.u8();
            r.u32();
            if (fl & 1) r.u32();
          } else if (kind === 3) {
            const vt = r.u8();
            if (vt === EXTERN) throw new Error("imported externref globals are not supported");
            r.u8();
          }
        }
      } else if (s.id === 3) {
        const n = r.u32();
        for (let i = 0; i < n; i++) meta.funcTypes.push(r.u32());
      } else if (s.id === 4) {
        const n = r.u32();
        for (let i = 0; i < n; i++) {
          const et = r.u8();
          const fl = r.u8();
          const min = r.u32();
          const max = fl & 1 ? r.u32() : null;
          if (et !== EXTERN && et !== FUNCREF) throw new Error("unsupported table type");
          tables.push({ extern: et === EXTERN, min, max });
        }
      }
    }

    let nextTable = 0;
    tables.forEach((t, i) => {
      if (t.extern) {
        t.helperBase = numFuncImports + meta.externTables.length * HELPERS.length;
        meta.externTables.push({ index: i, min: t.min, max: t.max, exportNames: [] });
      } else {
        t.newIndex = nextTable++;
      }
    });
    if (nextTable > 1) throw new Error("more than one funcref table is not supported");
    const helperCount = meta.externTables.length * HELPERS.length;
    meta.helperCount = helperCount;
    const helperTypeBase = meta.types.length;
    const helperTypes = [
      [[I32], [I32]], // tget(index) -> handle
      [[I32, I32], []], // tset(index, handle)
      [[I32, I32], [I32]], // tgrow(handle, delta) -> old size
      [[], [I32]], // tsize() -> size
      [[I32, I32, I32], []], // tfill(index, handle, count)
    ];

    const remapFunc = (f) => (f < numFuncImports ? f : f + helperCount);
    const tableAt = (i) => {
      const t = tables[i];
      if (!t) throw new Error(`bad table index ${i}`);
      return t;
    };
    const funcTableIndex = (i) => {
      const t = tableAt(i);
      if (t.extern) throw new Error("funcref operation on an externref table");
      return t.newIndex;
    };

    const out = new Writer();
    out.bytes([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

    for (const s of sections) {
      const r = new Reader(s.body);
      const w = new Writer();
      if (s.id === 0) {
        continue; // custom sections (names etc.) would hold stale indices
      } else if (s.id === 1) {
        w.u32(meta.types.length + (helperCount ? helperTypes.length : 0));
        const emit = (params, results) => {
          w.byte(0x60);
          w.u32(params.length);
          params.forEach((t) => w.byte(lowerValType(t)));
          w.u32(results.length);
          results.forEach((t) => w.byte(lowerValType(t)));
        };
        meta.types.forEach((t) => emit(t.params, t.results));
        if (helperCount) helperTypes.forEach((t) => emit(t[0], t[1]));
      } else if (s.id === 2) {
        const n = r.u32();
        w.u32(n + helperCount);
        for (let i = 0; i < n; i++) {
          w.name(r.name());
          w.name(r.name());
          const kind = r.u8();
          w.byte(kind);
          if (kind === 0) {
            w.u32(r.u32());
          } else if (kind === 1) {
            w.byte(r.u8());
            const fl = r.u8();
            w.byte(fl);
            w.u32(r.u32());
            if (fl & 1) w.u32(r.u32());
          } else if (kind === 2) {
            const fl = r.u8();
            w.byte(fl);
            w.u32(r.u32());
            if (fl & 1) w.u32(r.u32());
          } else {
            w.byte(lowerValType(r.u8()));
            w.byte(r.u8());
          }
        }
        meta.externTables.forEach((t) => {
          HELPERS.forEach((h, k) => {
            w.name(HELPER_MODULE);
            w.name(`${h}_${t.index}`);
            w.byte(0);
            w.u32(helperTypeBase + k);
          });
        });
      } else if (s.id === 4) {
        const n = r.u32();
        const kept = [];
        for (let i = 0; i < n; i++) {
          const et = r.u8();
          const fl = r.u8();
          const min = r.u32();
          const max = fl & 1 ? r.u32() : null;
          if (et === FUNCREF) kept.push({ fl, min, max });
        }
        w.u32(kept.length);
        kept.forEach((t) => {
          w.byte(FUNCREF);
          w.byte(t.fl);
          w.u32(t.min);
          if (t.fl & 1) w.u32(t.max);
        });
      } else if (s.id === 6) {
        const n = r.u32();
        w.u32(n);
        for (let i = 0; i < n; i++) {
          w.byte(lowerValType(r.u8()));
          w.byte(r.u8());
          copyInitExpr(r, w);
        }
      } else if (s.id === 7) {
        const n = r.u32();
        const kept = [];
        for (let i = 0; i < n; i++) {
          const name = r.name();
          const kind = r.u8();
          const idx = r.u32();
          meta.exports.push({ name, kind, index: idx });
          if (kind === 1) {
            const t = tableAt(idx);
            if (t.extern) {
              meta.externTables.find((x) => x.index === idx).exportNames.push(name);
              continue;
            }
            kept.push({ name, kind, idx: t.newIndex });
          } else if (kind === 0) {
            kept.push({ name, kind, idx: remapFunc(idx) });
          } else {
            kept.push({ name, kind, idx });
          }
        }
        w.u32(kept.length);
        kept.forEach((e) => {
          w.name(e.name);
          w.byte(e.kind);
          w.u32(e.idx);
        });
      } else if (s.id === 8) {
        w.u32(remapFunc(r.u32()));
      } else if (s.id === 9) {
        lowerElements(r, w, remapFunc, funcTableIndex);
      } else if (s.id === 10) {
        const n = r.u32();
        w.u32(n);
        for (let i = 0; i < n; i++) {
          const size = r.u32();
          const end = r.p + size;
          const body = new Writer();
          const groups = r.u32();
          body.u32(groups);
          for (let g = 0; g < groups; g++) {
            body.u32(r.u32());
            body.byte(lowerValType(r.u8()));
          }
          lowerCode(r, end, body, { remapFunc, tableAt, funcTableIndex });
          w.u32(body.a.length);
          w.bytes(body.a);
        }
      } else {
        w.bytes(s.body);
      }
      out.section(s.id, w);
    }

    return { bytes: Uint8Array.from(out.a), meta };
  }

  function lowerElements(r, w, remapFunc, funcTableIndex) {
    const n = r.u32();
    const segs = [];
    for (let i = 0; i < n; i++) {
      const flags = r.u32();
      let table = 0;
      let offset = null;
      const funcs = [];
      if (flags & 1) throw new Error("passive/declarative element segments are not supported");
      if (flags & 2) table = r.u32();
      const ow = new Writer();
      copyInitExpr(r, ow);
      offset = ow.a;
      if (flags & 2) {
        const kind = r.u8();
        if (flags & 4 ? kind !== FUNCREF : kind !== 0x00) throw new Error("unsupported element kind");
      }
      const count = r.u32();
      for (let j = 0; j < count; j++) {
        if (flags & 4) {
          const op = r.u8();
          if (op !== 0xd2) throw new Error("unsupported element expression");
          funcs.push(r.u32());
          if (r.u8() !== 0x0b) throw new Error("bad element expression");
        } else {
          funcs.push(r.u32());
        }
      }
      segs.push({ table, offset, funcs });
    }
    w.u32(segs.length);
    segs.forEach((seg) => {
      if (funcTableIndex(seg.table) !== 0) throw new Error("element segment for non-zero table");
      w.u32(0);
      w.bytes(seg.offset);
      w.u32(seg.funcs.length);
      seg.funcs.forEach((f) => w.u32(remapFunc(f)));
    });
  }

  function copyLeb(r, w) {
    const start = r.p;
    r.skipLeb();
    w.bytes(r.b.subarray(start, r.p));
  }

  function lowerCode(r, end, w, ctx) {
    const helperCall = (tableIndex, which) => {
      const t = ctx.tableAt(tableIndex);
      if (!t.extern) throw new Error("table.get/set/grow/size/fill on funcref tables is not supported");
      w.byte(0x10);
      w.u32(t.helperBase + which);
    };
    while (r.p < end) {
      const op = r.u8();
      if (op === 0x02 || op === 0x03 || op === 0x04) {
        w.byte(op);
        const bt = r.b[r.p];
        if (bt === 0x40 || bt === I32 || bt === 0x7e || bt === 0x7d || bt === 0x7c) {
          w.byte(r.u8());
        } else if (bt === EXTERN) {
          r.p++;
          w.byte(I32);
        } else if (bt === FUNCREF || bt === 0x7b) {
          throw new Error("unsupported block type");
        } else {
          copyLeb(r, w);
        }
      } else if (op === 0x0c || op === 0x0d || (op >= 0x20 && op <= 0x24)) {
        w.byte(op);
        copyLeb(r, w);
      } else if (op === 0x0e) {
        w.byte(op);
        const n = r.u32();
        w.u32(n);
        for (let i = 0; i <= n; i++) copyLeb(r, w);
      } else if (op === 0x10) {
        w.byte(op);
        w.u32(ctx.remapFunc(r.u32()));
      } else if (op === 0x11) {
        w.byte(op);
        copyLeb(r, w);
        w.u32(ctx.funcTableIndex(r.u32()));
      } else if (op === 0x12 || op === 0x13) {
        throw new Error("tail calls are not supported");
      } else if (op === 0x1c) {
        const n = r.u32();
        for (let i = 0; i < n; i++) r.u8();
        w.byte(0x1b);
      } else if (op === 0x25) {
        helperCall(r.u32(), 0);
      } else if (op === 0x26) {
        helperCall(r.u32(), 1);
      } else if (op >= 0x28 && op <= 0x3e) {
        w.byte(op);
        copyLeb(r, w);
        copyLeb(r, w);
      } else if (op === 0x3f || op === 0x40) {
        w.byte(op);
        w.byte(r.u8());
      } else if (op === 0x41 || op === 0x42) {
        w.byte(op);
        copyLeb(r, w);
      } else if (op === 0x43) {
        w.byte(op);
        w.bytes(r.b.subarray(r.p, r.p + 4));
        r.p += 4;
      } else if (op === 0x44) {
        w.byte(op);
        w.bytes(r.b.subarray(r.p, r.p + 8));
        r.p += 8;
      } else if (op === 0xd0) {
        const ht = r.u8();
        if (ht !== EXTERN) throw new Error("ref.null funcref is not supported");
        w.byte(0x41);
        w.byte(0x00);
      } else if (op === 0xd1) {
        w.byte(0x45);
      } else if (op === 0xd2) {
        throw new Error("ref.func is not supported");
      } else if (op === 0xfc) {
        const sub = r.u32();
        if (sub <= 7) {
          w.byte(op);
          w.u32(sub);
        } else if (sub === 8) {
          w.byte(op);
          w.u32(sub);
          copyLeb(r, w);
          w.byte(r.u8());
        } else if (sub === 9 || sub === 13) {
          w.byte(op);
          w.u32(sub);
          copyLeb(r, w);
        } else if (sub === 10) {
          w.byte(op);
          w.u32(sub);
          w.byte(r.u8());
          w.byte(r.u8());
        } else if (sub === 11) {
          w.byte(op);
          w.u32(sub);
          w.byte(r.u8());
        } else if (sub === 12) {
          w.byte(op);
          w.u32(sub);
          copyLeb(r, w);
          w.u32(ctx.funcTableIndex(r.u32()));
        } else if (sub === 14) {
          w.byte(op);
          w.u32(sub);
          w.u32(ctx.funcTableIndex(r.u32()));
          w.u32(ctx.funcTableIndex(r.u32()));
        } else if (sub === 15) {
          helperCall(r.u32(), 2);
        } else if (sub === 16) {
          helperCall(r.u32(), 3);
        } else if (sub === 17) {
          helperCall(r.u32(), 4);
        } else {
          throw new Error(`unsupported 0xfc opcode ${sub}`);
        }
      } else if (op === 0xfd || op === 0xfe) {
        throw new Error("SIMD/threads are not supported");
      } else {
        // Control (0x00 0x01 0x05 0x0b 0x0f), drop/select, and plain numeric ops have no immediates.
        w.byte(op);
      }
    }
  }

  function usesExtern(type) {
    return type.params.indexOf(EXTERN) >= 0 || type.results.indexOf(EXTERN) >= 0;
  }

  /**
   * Instantiate a lowered module with JS-value imports, returning JS-value exports.
   * @param {ArrayBuffer|Uint8Array} source original (unlowered) module bytes
   * @param {object} imports import object as the module's JS glue built it
   */
  async function instantiate(source, imports) {
    const original = source instanceof Uint8Array ? source : new Uint8Array(source);
    const { bytes, meta } = lower(original);

    const refs = [null];
    const toHandle = (v) => {
      if (v === null) return 0;
      refs.push(v);
      return refs.length - 1;
    };
    const fromHandle = (h) => (h === 0 ? null : refs[h]);

    const tableValues = {};
    const finalImports = {};
    Object.keys(imports || {}).forEach((mod) => {
      finalImports[mod] = Object.assign({}, imports[mod]);
    });
    meta.funcImports.forEach((imp) => {
      const type = meta.types[imp.typeIndex];
      const fn = imports[imp.module] && imports[imp.module][imp.name];
      if (typeof fn !== "function" || !usesExtern(type)) return;
      finalImports[imp.module][imp.name] = function loweredImport() {
        const args = new Array(arguments.length);
        for (let i = 0; i < arguments.length; i++) {
          args[i] = type.params[i] === EXTERN ? fromHandle(arguments[i]) : arguments[i];
        }
        const result = fn.apply(this, args);
        return type.results[0] === EXTERN ? toHandle(result) : result;
      };
    });
    if (meta.externTables.length) finalImports[HELPER_MODULE] = {};
    meta.externTables.forEach((t) => {
      const values = new Array(t.min).fill(null);
      tableValues[t.index] = values;
      const grow = (value, delta) => {
        const old = values.length;
        if (t.max !== null && old + delta > t.max) return -1;
        for (let i = 0; i < delta; i++) values.push(value);
        return old;
      };
      const h = finalImports[HELPER_MODULE];
      h[`tget_${t.index}`] = (i) => {
        if (i >= values.length) throw new RangeError("table index out of bounds");
        return toHandle(values[i]);
      };
      h[`tset_${t.index}`] = (i, handle) => {
        if (i >= values.length) throw new RangeError("table index out of bounds");
        values[i] = fromHandle(handle);
      };
      h[`tgrow_${t.index}`] = (handle, delta) => grow(fromHandle(handle), delta);
      h[`tsize_${t.index}`] = () => values.length;
      h[`tfill_${t.index}`] = (i, handle, n) => {
        if (i + n > values.length) throw new RangeError("table index out of bounds");
        const v = fromHandle(handle);
        for (let k = 0; k < n; k++) values[i + k] = v;
      };
    });

    const result = await nativeInstantiate(bytes, finalImports);
    const raw = result.instance.exports;
    const exports = {};
    meta.exports.forEach((e) => {
      if (e.kind === 1) {
        const t = meta.externTables.find((x) => x.index === e.index);
        if (t) {
          const values = tableValues[t.index];
          exports[e.name] = {
            get: (i) => values[i],
            set: (i, v) => {
              values[i] = v;
            },
            grow: (delta, init) => {
              const old = values.length;
              for (let i = 0; i < delta; i++) values.push(init === undefined ? null : init);
              return old;
            },
            get length() {
              return values.length;
            },
          };
          return;
        }
      }
      const value = raw[e.name];
      if (e.kind !== 0 || typeof value !== "function") {
        exports[e.name] = value;
        return;
      }
      const type = meta.types[meta.funcTypes[e.index]];
      if (!usesExtern(type)) {
        exports[e.name] = value;
        return;
      }
      exports[e.name] = function loweredExport() {
        const args = new Array(arguments.length);
        for (let i = 0; i < arguments.length; i++) {
          args[i] = type.params[i] === EXTERN ? toHandle(arguments[i]) : arguments[i];
        }
        const out = value.apply(this, args);
        return type.results[0] === EXTERN ? fromHandle(out) : out;
      };
    });
    return { instance: { exports }, module: result.module };
  }

  return { lower, instantiate };
})();
