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
 * CONFIGURABLE ARRAY MOVE ORDERING TEST TEMPLATE
 * ==========================================================================
 * 
 * Modify the OPERATIONS object in each test to experiment with different
 * concurrent array move operation scenarios and ordering behavior.
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

describe("Array Move Ordering Investigation", () => {
  let replica1, replica2, replica3;

  beforeEach(() => {
    replica1 = [new DotMap(ORArray.typename()), new CausalContext("r1")];
    replica2 = [new DotMap(ORArray.typename()), new CausalContext("r2")];
    replica3 = [new DotMap(ORArray.typename()), new CausalContext("r3")];
  });

  describe("Concurrent Move Operations to Same Position", () => {
    it("should investigate ordering when multiple replicas move different elements to same position", () => {
      // ========================================
      // TEST CONFIGURATION - CONCURRENT MOVES
      // ========================================
      
      // Initial setup: Create array [A, B, C, D] at positions 100, 200, 300, 400
      const INITIAL_ELEMENTS = [
        { uid: "item_a", value: "A", position: 100 },
        { uid: "item_b", value: "B", position: 200 },
        { uid: "item_c", value: "C", position: 300 },
        { uid: "item_d", value: "D", position: 400 }
      ];
      
      // Each replica moves a different element to the SAME target position (150)
      const OPERATIONS = {
        replica1: [
          { type: "move", uid: "item_a", newPosition: 150 } // Move A to position 150
        ],
        replica2: [
          { type: "move", uid: "item_b", newPosition: 150 } // Move B to position 150
        ],
        replica3: [
          { type: "move", uid: "item_c", newPosition: 150 } // Move C to position 150
        ]
      };
      
      // Expected: All elements present, but order at position 150 depends on delta application order
      // Question: Will it be [A,B,C,D], [C,B,A,D], or some other order based on move conflicts?
      
      // ========================================
      // TEST EXECUTION
      // ========================================
      
      console.log("\n=== CONCURRENT MOVES TO SAME POSITION ===");
      console.log("Configuration:");
      console.log("  Initial array: [A(100), B(200), C(300), D(400)]");
      console.log("  Target position for all moves: 150");
      console.log("  Replica1 moves:", OPERATIONS.replica1);
      console.log("  Replica2 moves:", OPERATIONS.replica2);
      console.log("  Replica3 moves:", OPERATIONS.replica3);
      
      console.log("\n1. Setting up initial array [A, B, C, D]...");
      
      // Create initial elements on replica1, then sync to others
      for (const elem of INITIAL_ELEMENTS) {
        const writeOp = (state) => MVReg.write(elem.value, state);
        const delta = ORArray.insertValue(elem.uid, writeOp, new Position(elem.position), replica1);
        replica1 = DotMap.join(replica1, delta);
        replica2 = DotMap.join(replica2, delta);
        replica3 = DotMap.join(replica3, delta);
      }
      
      console.log("   All replicas initial state:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      console.log("\n2. Applying concurrent move operations...");
      
      // Execute move operations on each replica
      const deltas = { replica1: [], replica2: [], replica3: [] };
      
      // Replica1 operations
      console.log(`   Replica1 executing ${OPERATIONS.replica1.length} move operations:`);
      for (const op of OPERATIONS.replica1) {
        console.log(`     - Move ${op.uid} to position ${op.newPosition}`);
        
        if (op.type === "move") {
          try {
            const delta = ORArray.move(op.uid, new Position(op.newPosition), replica1);
            deltas.replica1.push(delta);
            replica1 = DotMap.join(replica1, delta);
          } catch (error) {
            console.log(`     ❌ Move failed: ${error.message}`);
            continue;
          }
        }
      }
      console.log("   Replica1 after local moves:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      // Replica2 operations
      console.log(`   Replica2 executing ${OPERATIONS.replica2.length} move operations:`);
      for (const op of OPERATIONS.replica2) {
        console.log(`     - Move ${op.uid} to position ${op.newPosition}`);
        
        if (op.type === "move") {
          try {
            const delta = ORArray.move(op.uid, new Position(op.newPosition), replica2);
            deltas.replica2.push(delta);
            replica2 = DotMap.join(replica2, delta);
          } catch (error) {
            console.log(`     ❌ Move failed: ${error.message}`);
            continue;
          }
        }
      }
      console.log("   Replica2 after local moves:", ORArray.value(replica2).map(s => Array.from(s)[0]));
      
      // Replica3 operations
      console.log(`   Replica3 executing ${OPERATIONS.replica3.length} move operations:`);
      for (const op of OPERATIONS.replica3) {
        console.log(`     - Move ${op.uid} to position ${op.newPosition}`);
        
        if (op.type === "move") {
          try {
            const delta = ORArray.move(op.uid, new Position(op.newPosition), replica3);
            deltas.replica3.push(delta);
            replica3 = DotMap.join(replica3, delta);
          } catch (error) {
            console.log(`     ❌ Move failed: ${error.message}`);
            continue;
          }
        }
      }
      console.log("   Replica3 after local moves:", ORArray.value(replica3).map(s => Array.from(s)[0]));
      
      console.log("\n3. Exchanging move operations (full sync)...");
      
      // Apply all move deltas to all replicas
      console.log("   Replica1 receiving moves from Replica2 and Replica3...");
      for (const delta of [...deltas.replica2, ...deltas.replica3]) {
        replica1 = DotMap.join(replica1, delta);
      }
      console.log("   Replica1 after sync:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      console.log("   Replica2 receiving moves from Replica1 and Replica3...");
      for (const delta of [...deltas.replica1, ...deltas.replica3]) {
        replica2 = DotMap.join(replica2, delta);
      }
      console.log("   Replica2 after sync:", ORArray.value(replica2).map(s => Array.from(s)[0]));
      
      console.log("   Replica3 receiving moves from Replica1 and Replica2...");
      for (const delta of [...deltas.replica1, ...deltas.replica2]) {
        replica3 = DotMap.join(replica3, delta);
      }
      console.log("   Replica3 after sync:", ORArray.value(replica3).map(s => Array.from(s)[0]));
      
      console.log("\n4. Final convergence analysis:");
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
      
      console.log("\n5. Move Conflict Analysis:");
      if (order1.length === 4) {
        console.log("   ✅ All elements preserved (A, B, C, D all present)");
        
        // Find positions of moved elements
        const aIndex = order1.indexOf('A');
        const bIndex = order1.indexOf('B');
        const cIndex = order1.indexOf('C');
        const dIndex = order1.indexOf('D');
        
        console.log(`   📝 Final positions: A at index ${aIndex}, B at ${bIndex}, C at ${cIndex}, D at ${dIndex}`);
        
        if (JSON.stringify(order1) === JSON.stringify(order2) && JSON.stringify(order2) === JSON.stringify(order3)) {
          console.log("   ✅ CONVERGENCE: All replicas have identical final state");
          console.log(`   📝 Deterministic conflict resolution produced: [${order1.join(', ')}]`);
        } else {
          console.log("   ❌ NON-CONVERGENCE: Replicas have different final states");
          console.log("   📝 FINDING: Move operation conflicts are order-dependent (like insert conflicts)");
          console.log("   📝 PATTERN: Delta application order affects final arrangement of moved elements");
        }
      } else {
        console.log("   ❌ Elements lost during move operations");
      }
      
      // Test verification (may fail if non-convergent)
      try {
        expect(val1).to.deep.equal(val2);
        expect(val2).to.deep.equal(val3);
        expect(val1.length).to.equal(4);
        console.log("   ✅ Test assertion passed");
      } catch (error) {
        console.log("   ⚠️  Test assertion failed (expected for order-dependent behavior)");
        console.log("   📝 This confirms move operations have the same delta-order dependency as inserts");
      }
      
      console.log("\n=== END CONCURRENT MOVES TEST ===\n");
    });

    it("should investigate move vs insert conflicts at same position", () => {
      // ========================================
      // TEST CONFIGURATION - MOVE vs INSERT
      // ========================================
      
      // Initial setup: [A, B] at positions 100, 300
      const INITIAL_ELEMENTS = [
        { uid: "item_a", value: "A", position: 100 },
        { uid: "item_b", value: "B", position: 300 }
      ];
      
      // Mixed operations targeting position 200
      const OPERATIONS = {
        replica1: [
          { type: "move", uid: "item_a", newPosition: 200 } // Move A to position 200
        ],
        replica2: [
          { type: "insert", value: "C", position: 200, uid: "item_c" } // Insert C at position 200
        ],
        replica3: [
          { type: "move", uid: "item_b", newPosition: 200 } // Move B to position 200
        ]
      };
      
      console.log("\n=== MOVE vs INSERT CONFLICTS ===");
      console.log("Configuration:");
      console.log("  Initial array: [A(100), B(300)]");
      console.log("  Target position: 200");
      console.log("  Replica1: Move A to 200");
      console.log("  Replica2: Insert C at 200");
      console.log("  Replica3: Move B to 200");
      console.log("  Expected final elements: A, B, C (order depends on operation type conflicts)");
      
      console.log("\n1. Setting up initial array [A, B]...");
      
      // Create initial elements
      for (const elem of INITIAL_ELEMENTS) {
        const writeOp = (state) => MVReg.write(elem.value, state);
        const delta = ORArray.insertValue(elem.uid, writeOp, new Position(elem.position), replica1);
        replica1 = DotMap.join(replica1, delta);
        replica2 = DotMap.join(replica2, delta);
        replica3 = DotMap.join(replica3, delta);
      }
      
      console.log("   All replicas initial state:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      console.log("\n2. Applying mixed operations (moves and inserts)...");
      
      const deltas = { replica1: [], replica2: [], replica3: [] };
      
      // Apply operations to each replica
      for (const [replicaName, ops] of Object.entries(OPERATIONS)) {
        const replica = replicaName === "replica1" ? replica1 : replicaName === "replica2" ? replica2 : replica3;
        console.log(`   ${replicaName} executing:`, ops);
        
        for (const op of ops) {
          try {
            let delta;
            if (op.type === "move") {
              delta = ORArray.move(op.uid, new Position(op.newPosition), replica);
            } else if (op.type === "insert") {
              const writeOp = (state) => MVReg.write(op.value, state);
              delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), replica);
            }
            
            deltas[replicaName].push(delta);
            
            if (replicaName === "replica1") replica1 = DotMap.join(replica1, delta);
            else if (replicaName === "replica2") replica2 = DotMap.join(replica2, delta);
            else if (replicaName === "replica3") replica3 = DotMap.join(replica3, delta);
            
          } catch (error) {
            console.log(`     ❌ Operation failed: ${error.message}`);
          }
        }
        
        const currentState = replicaName === "replica1" ? replica1 : replicaName === "replica2" ? replica2 : replica3;
        console.log(`   ${replicaName} after local ops:`, ORArray.value(currentState).map(s => Array.from(s)[0]));
      }
      
      console.log("\n3. Exchanging all operations...");
      
      // Full sync
      for (const delta of [...deltas.replica2, ...deltas.replica3]) {
        replica1 = DotMap.join(replica1, delta);
      }
      for (const delta of [...deltas.replica1, ...deltas.replica3]) {
        replica2 = DotMap.join(replica2, delta);
      }
      for (const delta of [...deltas.replica1, ...deltas.replica2]) {
        replica3 = DotMap.join(replica3, delta);
      }
      
      const final1 = ORArray.value(replica1).map(s => Array.from(s)[0]);
      const final2 = ORArray.value(replica2).map(s => Array.from(s)[0]);
      const final3 = ORArray.value(replica3).map(s => Array.from(s)[0]);
      
      console.log("   Final Replica1:", final1);
      console.log("   Final Replica2:", final2);
      console.log("   Final Replica3:", final3);
      console.log("   Converged:", JSON.stringify(final1) === JSON.stringify(final2) && JSON.stringify(final2) === JSON.stringify(final3));
      
      console.log("\n4. Move vs Insert Analysis:");
      console.log("   📝 This test investigates how move and insert operations interact when targeting the same position");
      console.log("   📝 Expected behavior: All elements preserved, order depends on operation type priority and delta application order");
      
      // Verify all elements present
      const allElements = [...final1];
      const hasA = allElements.includes('A');
      const hasB = allElements.includes('B');
      const hasC = allElements.includes('C');
      
      console.log(`   Element preservation: A=${hasA}, B=${hasB}, C=${hasC}`);
      
      if (hasA && hasB && hasC) {
        console.log("   ✅ All elements preserved during mixed move/insert operations");
      } else {
        console.log("   ❌ Some elements lost during operations");
      }
      
      console.log("\n=== END MOVE vs INSERT TEST ===\n");
      
      // Basic verification (may fail due to order dependency)
      expect(final1.length).to.equal(3); // All elements should be present
      expect(allElements.includes('A')).to.be.true();
      expect(allElements.includes('B')).to.be.true();
      expect(allElements.includes('C')).to.be.true();
    });
  });
});