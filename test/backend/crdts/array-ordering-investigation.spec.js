/* eslint-env mocha */
"use strict";

const chai = require("chai");
const dirtyChai = require("dirty-chai");
const expect = chai.expect;
chai.use(dirtyChai);

const { ORArray, MVReg } = require("../../../src/backend/crdts");
const { DotMap } = require("../../../src/backend/dotstores");
const CausalContext = require("../../../src/backend/causal-context");
const Position = require("../../../src/backend/utils/position");

/*
 * ==========================================================================
 * CONFIGURABLE ARRAY ORDERING TEST TEMPLATE
 * ==========================================================================
 * 
 * Modify the OPERATIONS object in each test to experiment with different
 * concurrent array operation scenarios and ordering behavior.
 * 
 * Supported operations:
 * - insert: { value: "val", position: 100, uid: "uniqueId" }
 * - move: { uid: "uniqueId", newPosition: 200 }
 * - update: { uid: "uniqueId", newValue: "newVal" }
 * - delete: { uid: "uniqueId" }
 * 
 * Position values determine ordering (lower = earlier in array)
 * UIDs must be unique within the test
 * ==========================================================================
 */

describe("Array Ordering Investigation", () => {
  let replica1, replica2, replica3;

  beforeEach(() => {
    replica1 = [new DotMap(ORArray.typename()), new CausalContext("r1")];
    replica2 = [new DotMap(ORArray.typename()), new CausalContext("r2")];
    replica3 = [new DotMap(ORArray.typename()), new CausalContext("r3")];
  });

  describe("Concurrent Insert Operations", () => {
    it("should investigate ordering when multiple replicas insert at same position", () => {
      // ========================================
      // TEST CONFIGURATION - CONCURRENT INSERTS
      // ========================================
      
      // Each replica inserts at the SAME position (100)
      const OPERATIONS = {
        replica1: [
          { type: "insert", value: "A", position: 100, uid: "item_a" }
        ],
        replica2: [
          { type: "insert", value: "B", position: 100, uid: "item_b" }
        ],
        replica3: [
          { type: "insert", value: "C", position: 100, uid: "item_c" }
        ]
      };
      
      // Expected: All elements present in deterministic order
      // Question: Will it be [A,B,C], [C,B,A], or some other order?
      
      // ========================================
      // TEST EXECUTION
      // ========================================
      
      console.log("\n=== CONCURRENT INSERTS AT SAME POSITION ===");
      console.log("Configuration:");
      console.log("  All replicas insert at position 100");
      console.log("  Replica1:", OPERATIONS.replica1);
      console.log("  Replica2:", OPERATIONS.replica2);
      console.log("  Replica3:", OPERATIONS.replica3);
      
      console.log("\n1. Applying operations concurrently...");
      
      // Execute operations on each replica
      for (const op of OPERATIONS.replica1) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica1);
          replica1 = DotMap.join(replica1, delta);
        }
      }
      console.log("   Replica1 after local ops:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      for (const op of OPERATIONS.replica2) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica2);
          replica2 = DotMap.join(replica2, delta);
        }
      }
      console.log("   Replica2 after local ops:", ORArray.value(replica2).map(s => Array.from(s)[0]));
      
      for (const op of OPERATIONS.replica3) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica3);
          replica3 = DotMap.join(replica3, delta);
        }
      }
      console.log("   Replica3 after local ops:", ORArray.value(replica3).map(s => Array.from(s)[0]));
      
      console.log("\n2. Exchanging operations (full sync)...");
      
      // Capture operations for exchange
      const deltas = {
        replica1: [],
        replica2: [], 
        replica3: []
      };
      
      // Re-execute to capture deltas
      let r1_clean = [new DotMap(ORArray.typename()), new CausalContext("r1")];
      let r2_clean = [new DotMap(ORArray.typename()), new CausalContext("r2")];
      let r3_clean = [new DotMap(ORArray.typename()), new CausalContext("r3")];
      
      for (const op of OPERATIONS.replica1) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r1_clean);
          deltas.replica1.push(delta);
          r1_clean = DotMap.join(r1_clean, delta);
        }
      }
      
      for (const op of OPERATIONS.replica2) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r2_clean);
          deltas.replica2.push(delta);
          r2_clean = DotMap.join(r2_clean, delta);
        }
      }
      
      for (const op of OPERATIONS.replica3) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r3_clean);
          deltas.replica3.push(delta);
          r3_clean = DotMap.join(r3_clean, delta);
        }
      }
      
      // Apply all deltas to all replicas
      console.log("   Applying all operations to all replicas...");
      for (const delta of deltas.replica2) {
        replica1 = DotMap.join(replica1, delta);
      }
      for (const delta of deltas.replica3) {
        replica1 = DotMap.join(replica1, delta);
      }
      
      for (const delta of deltas.replica1) {
        replica2 = DotMap.join(replica2, delta);
      }
      for (const delta of deltas.replica3) {
        replica2 = DotMap.join(replica2, delta);
      }
      
      for (const delta of deltas.replica1) {
        replica3 = DotMap.join(replica3, delta);
      }
      for (const delta of deltas.replica2) {
        replica3 = DotMap.join(replica3, delta);
      }
      
      console.log("\n3. Final convergence analysis:");
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);
      const val3 = ORArray.value(replica3);
      
      const order1 = val1.map(s => Array.from(s)[0]);
      const order2 = val2.map(s => Array.from(s)[0]);
      const order3 = val3.map(s => Array.from(s)[0]);
      
      console.log("   Replica1 final order:", order1);
      console.log("   Replica2 final order:", order2);
      console.log("   Replica3 final order:", order3);
      console.log("   All replicas converged:", JSON.stringify(order1) === JSON.stringify(order2) && JSON.stringify(order2) === JSON.stringify(order3));
      
      console.log("\n4. Ordering Analysis:");
      if (order1.length === 3) {
        console.log("   ✅ All elements preserved");
        console.log(`   📝 Final deterministic order: [${order1.join(', ')}]`);
        
        // Analyze the ordering pattern
        if (order1[0] === 'A' && order1[1] === 'B' && order1[2] === 'C') {
          console.log("   📝 PATTERN: Replica ID ascending order (r1 < r2 < r3)");
        } else if (order1[0] === 'C' && order1[1] === 'B' && order1[2] === 'A') {
          console.log("   📝 PATTERN: Replica ID descending order (r3 > r2 > r1)");
        } else {
          console.log(`   📝 PATTERN: Custom ordering - ${order1.join(' → ')}`);
        }
      } else {
        console.log("   ❌ Some elements lost during merge");
      }
      
      // Verify convergence
      expect(val1).to.deep.equal(val2);
      expect(val2).to.deep.equal(val3);
      expect(val1.length).to.equal(3);
      
      console.log("\n=== END CONCURRENT INSERTS TEST ===\n");
    });

    it("should investigate ordering with different positions", () => {
      // ========================================
      // TEST CONFIGURATION - DIFFERENT POSITIONS
      // ========================================
      
      // Each replica inserts at DIFFERENT positions
      const OPERATIONS = {
        replica1: [
          { type: "insert", value: "First", position: 50, uid: "item_1" }
        ],
        replica2: [
          { type: "insert", value: "Second", position: 150, uid: "item_2" }
        ],
        replica3: [
          { type: "insert", value: "Third", position: 100, uid: "item_3" }
        ]
      };
      
      // Expected order by position: First(50), Third(100), Second(150)
      
      console.log("\n=== INSERTS AT DIFFERENT POSITIONS ===");
      console.log("Configuration:");
      console.log("  Expected order by position: First(50) → Third(100) → Second(150)");
      console.log("  Replica1:", OPERATIONS.replica1);
      console.log("  Replica2:", OPERATIONS.replica2);
      console.log("  Replica3:", OPERATIONS.replica3);
      
      // Apply operations (same logic as above)
      for (const op of OPERATIONS.replica1) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica1);
          replica1 = DotMap.join(replica1, delta);
        }
      }
      
      for (const op of OPERATIONS.replica2) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica2);
          replica2 = DotMap.join(replica2, delta);
        }
      }
      
      for (const op of OPERATIONS.replica3) {
        if (op.type === "insert") {
          const writeOp = (state) => MVReg.write(op.value, state);
          const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica3);
          replica3 = DotMap.join(replica3, delta);
        }
      }
      
      // Capture and exchange operations
      const deltas = { replica1: [], replica2: [], replica3: [] };
      
      let r1_clean = [new DotMap(ORArray.typename()), new CausalContext("r1")];
      let r2_clean = [new DotMap(ORArray.typename()), new CausalContext("r2")];
      let r3_clean = [new DotMap(ORArray.typename()), new CausalContext("r3")];
      
      for (const op of OPERATIONS.replica1) {
        const writeOp = (state) => MVReg.write(op.value, state);
        const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r1_clean);
        deltas.replica1.push(delta);
        r1_clean = DotMap.join(r1_clean, delta);
      }
      
      for (const op of OPERATIONS.replica2) {
        const writeOp = (state) => MVReg.write(op.value, state);
        const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r2_clean);
        deltas.replica2.push(delta);
        r2_clean = DotMap.join(r2_clean, delta);
      }
      
      for (const op of OPERATIONS.replica3) {
        const writeOp = (state) => MVReg.write(op.value, state);
        const delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), r3_clean);
        deltas.replica3.push(delta);
        r3_clean = DotMap.join(r3_clean, delta);
      }
      
      // Exchange all operations
      for (const delta of [...deltas.replica2, ...deltas.replica3]) {
        replica1 = DotMap.join(replica1, delta);
      }
      for (const delta of [...deltas.replica1, ...deltas.replica3]) {
        replica2 = DotMap.join(replica2, delta);
      }
      for (const delta of [...deltas.replica1, ...deltas.replica2]) {
        replica3 = DotMap.join(replica3, delta);
      }
      
      const val1 = ORArray.value(replica1);
      const order1 = val1.map(s => Array.from(s)[0]);
      
      console.log("\n   Final order:", order1);
      console.log("   Expected order: [First, Third, Second]");
      
      if (JSON.stringify(order1) === JSON.stringify(["First", "Third", "Second"])) {
        console.log("   ✅ PERFECT: Position-based ordering works correctly");
      } else {
        console.log(`   ⚠️  DIFFERENT: Actual order [${order1.join(', ')}] differs from position expectation`);
      }
      
      // Verify all replicas converge
      expect(ORArray.value(replica1)).to.deep.equal(ORArray.value(replica2));
      expect(ORArray.value(replica2)).to.deep.equal(ORArray.value(replica3));
      
      console.log("\n=== END DIFFERENT POSITIONS TEST ===\n");
    });
  });
});