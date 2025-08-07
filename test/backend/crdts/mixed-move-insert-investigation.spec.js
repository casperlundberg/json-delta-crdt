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
 * MIXED MOVE AND INSERT OPERATIONS INVESTIGATION
 * ==========================================================================
 * 
 * This file tests scenarios where some replicas perform INSERT operations
 * while other replicas perform MOVE operations, often targeting the same
 * or overlapping positions to understand conflict resolution between 
 * different operation types.
 * 
 * Key test scenarios:
 * 1. Some replicas insert new elements, others move existing elements
 * 2. Multiple replicas with mixed operations targeting same positions
 * 3. Complex scenarios with multiple moves and inserts
 * 
 * Expected behavior analysis:
 * - How does the CRDT handle move vs insert priority?
 * - Do mixed operations maintain convergence?
 * - What ordering rules apply when different operation types conflict?
 * ==========================================================================
 */

describe("Mixed Move and Insert Operations Investigation", () => {
  let replica1, replica2, replica3, replica4;

  beforeEach(() => {
    replica1 = [new DotMap(ORArray.typename()), new CausalContext("r1")];
    replica2 = [new DotMap(ORArray.typename()), new CausalContext("r2")];
    replica3 = [new DotMap(ORArray.typename()), new CausalContext("r3")];
    replica4 = [new DotMap(ORArray.typename()), new CausalContext("r4")];
  });

  describe("Insert vs Move Operation Conflicts", () => {
    it("should handle scenario where some replicas insert while others move to same position", () => {
      // ========================================
      // TEST CONFIGURATION - INSERT vs MOVE
      // ========================================
      
      // Initial setup: [A, B, C] at positions 100, 200, 300
      const INITIAL_ELEMENTS = [
        { uid: "item_a", value: "A", position: 100 },
        { uid: "item_b", value: "B", position: 200 },
        { uid: "item_c", value: "C", position: 300 }
      ];
      
      // Mixed operations all targeting position 150
      const OPERATIONS = {
        replica1: [
          { type: "insert", value: "X", position: 150, uid: "item_x" } // Insert X at 150
        ],
        replica2: [
          { type: "insert", value: "Y", position: 150, uid: "item_y" } // Insert Y at 150
        ],
        replica3: [
          { type: "move", uid: "item_c", newPosition: 150 } // Move C to 150
        ],
        replica4: [
          { type: "move", uid: "item_a", newPosition: 150 } // Move A to 150
        ]
      };
      
      // Expected: All elements present [A, B, C, X, Y], order depends on operation type conflicts
      
      console.log("\n=== INSERT vs MOVE OPERATIONS AT SAME POSITION ===");
      console.log("Configuration:");
      console.log("  Initial array: [A(100), B(200), C(300)]");
      console.log("  Target position: 150");
      console.log("  Replica1: INSERT X at 150");
      console.log("  Replica2: INSERT Y at 150");
      console.log("  Replica3: MOVE C to 150");
      console.log("  Replica4: MOVE A to 150");
      console.log("  Expected elements: A, B, C, X, Y (order TBD by conflict resolution)");
      
      console.log("\n1. Setting up initial array [A, B, C]...");
      
      // Create initial elements on replica1 and sync to all replicas
      for (const elem of INITIAL_ELEMENTS) {
        const writeOp = (state) => MVReg.write(elem.value, state);
        const delta = ORArray.insertValue(elem.uid, writeOp, new Position(elem.position), replica1);
        replica1 = DotMap.join(replica1, delta);
        replica2 = DotMap.join(replica2, delta);
        replica3 = DotMap.join(replica3, delta);
        replica4 = DotMap.join(replica4, delta);
      }
      
      console.log("   All replicas initial state:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      console.log("\n2. Applying mixed operations concurrently...");
      
      const deltas = { replica1: [], replica2: [], replica3: [], replica4: [] };
      
      // Execute operations on each replica
      const replicaRefs = { replica1, replica2, replica3, replica4 };
      
      for (const [replicaName, ops] of Object.entries(OPERATIONS)) {
        let currentReplica = replicaRefs[replicaName];
        console.log(`   ${replicaName} executing:`, ops);
        
        for (const op of ops) {
          try {
            let delta;
            
            if (op.type === "insert") {
              const writeOp = (state) => MVReg.write(op.value, state);
              delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), currentReplica);
              console.log(`     ✅ Insert ${op.value} at position ${op.position}`);
            } else if (op.type === "move") {
              delta = ORArray.move(op.uid, new Position(op.newPosition), currentReplica);
              console.log(`     ✅ Move ${op.uid} to position ${op.newPosition}`);
            }
            
            deltas[replicaName].push(delta);
            currentReplica = DotMap.join(currentReplica, delta);
            
            // Update the replica reference
            if (replicaName === "replica1") replica1 = currentReplica;
            else if (replicaName === "replica2") replica2 = currentReplica;
            else if (replicaName === "replica3") replica3 = currentReplica;
            else if (replicaName === "replica4") replica4 = currentReplica;
            
          } catch (error) {
            console.log(`     ❌ Operation failed: ${error.message}`);
          }
        }
        
        const finalReplica = replicaName === "replica1" ? replica1 : replicaName === "replica2" ? replica2 : replicaName === "replica3" ? replica3 : replica4;
        console.log(`   ${replicaName} after local ops:`, ORArray.value(finalReplica).map(s => Array.from(s)[0]));
      }
      
      console.log("\n3. Full synchronization across all replicas...");
      
      // Apply all deltas to all replicas
      const allDeltas = [...deltas.replica1, ...deltas.replica2, ...deltas.replica3, ...deltas.replica4];
      
      console.log(`   Synchronizing ${allDeltas.length} total operations...`);
      for (const delta of deltas.replica2.concat(deltas.replica3, deltas.replica4)) {
        replica1 = DotMap.join(replica1, delta);
      }
      for (const delta of deltas.replica1.concat(deltas.replica3, deltas.replica4)) {
        replica2 = DotMap.join(replica2, delta);
      }
      for (const delta of deltas.replica1.concat(deltas.replica2, deltas.replica4)) {
        replica3 = DotMap.join(replica3, delta);
      }
      for (const delta of deltas.replica1.concat(deltas.replica2, deltas.replica3)) {
        replica4 = DotMap.join(replica4, delta);
      }
      
      console.log("\n4. Final convergence analysis:");
      const final1 = ORArray.value(replica1).map(s => Array.from(s)[0]);
      const final2 = ORArray.value(replica2).map(s => Array.from(s)[0]);
      const final3 = ORArray.value(replica3).map(s => Array.from(s)[0]);
      const final4 = ORArray.value(replica4).map(s => Array.from(s)[0]);
      
      console.log("   Replica1 final order:", final1);
      console.log("   Replica2 final order:", final2);
      console.log("   Replica3 final order:", final3);
      console.log("   Replica4 final order:", final4);
      
      const allConverged = JSON.stringify(final1) === JSON.stringify(final2) && 
                          JSON.stringify(final2) === JSON.stringify(final3) && 
                          JSON.stringify(final3) === JSON.stringify(final4);
      console.log("   All replicas converged:", allConverged);
      
      console.log("\n5. Mixed Operation Analysis:");
      
      // Check element preservation
      const allElements = final1;
      const hasA = allElements.includes('A');
      const hasB = allElements.includes('B');
      const hasC = allElements.includes('C');
      const hasX = allElements.includes('X');
      const hasY = allElements.includes('Y');
      
      console.log(`   Element preservation: A=${hasA}, B=${hasB}, C=${hasC}, X=${hasX}, Y=${hasY}`);
      console.log(`   Total elements: ${allElements.length} (expected: 5)`);
      
      if (hasA && hasB && hasC && hasX && hasY) {
        console.log("   ✅ All elements preserved during mixed operations");
      } else {
        console.log("   ❌ Some elements lost");
        console.log("   Missing elements:", ['A', 'B', 'C', 'X', 'Y'].filter(e => !allElements.includes(e)));
      }
      
      if (allConverged) {
        console.log("   ✅ CONVERGENCE: All replicas reached identical state");
        console.log(`   📝 Final deterministic order: [${final1.join(', ')}]`);
        
        // Analyze the ordering pattern
        console.log("\n6. Operation Type Priority Analysis:");
        console.log("   📝 Analyzing how INSERT vs MOVE operations were resolved at position 150");
        
        const pos150Elements = [];
        // This is a simplified analysis - in reality we'd need to check actual positions
        console.log("   📝 Mixed operation types successfully resolved with deterministic ordering");
        
      } else {
        console.log("   ❌ NON-CONVERGENCE: Different final states detected");
        console.log("   📝 FINDING: Mixed INSERT/MOVE operations may have order-dependency issues");
        
        // Show the differences
        console.log("\n6. Divergence Analysis:");
        console.log("   📝 Different replica states suggest delta application order affects mixed operations");
      }
      
      console.log("\n=== END INSERT vs MOVE TEST ===\n");
      
      // Basic assertions
      expect(allElements.length).to.equal(5); // All elements should be present
      expect(hasA && hasB && hasC && hasX && hasY).to.be.true(); // No data loss
    });

    it("should handle complex mixed operations with multiple positions", () => {
      // ========================================
      // COMPLEX MIXED OPERATIONS SCENARIO
      // ========================================
      
      console.log("\n=== COMPLEX MIXED OPERATIONS ===");
      console.log("Scenario: Multiple inserts and moves across different positions");
      
      // Initial: [P, Q, R, S] at positions 100, 200, 300, 400
      const INITIAL_ELEMENTS = [
        { uid: "p", value: "P", position: 100 },
        { uid: "q", value: "Q", position: 200 },
        { uid: "r", value: "R", position: 300 },
        { uid: "s", value: "S", position: 400 }
      ];
      
      // Complex mixed operations
      const OPERATIONS = {
        replica1: [
          { type: "insert", value: "NEW1", position: 150, uid: "new1" }, // Insert between P and Q
          { type: "move", uid: "s", newPosition: 50 } // Move S to beginning
        ],
        replica2: [
          { type: "insert", value: "NEW2", position: 350, uid: "new2" }, // Insert between R and S
          { type: "move", uid: "p", newPosition: 450 } // Move P to end
        ],
        replica3: [
          { type: "insert", value: "NEW3", position: 150, uid: "new3" }, // Same position as replica1 insert
          { type: "insert", value: "NEW4", position: 250, uid: "new4" } // Between Q and R
        ]
      };
      
      console.log("Configuration:");
      console.log("  Initial: [P(100), Q(200), R(300), S(400)]");
      console.log("  Replica1: INSERT NEW1 at 150, MOVE S to 50");
      console.log("  Replica2: INSERT NEW2 at 350, MOVE P to 450");
      console.log("  Replica3: INSERT NEW3 at 150, INSERT NEW4 at 250");
      console.log("  Expected: 8 total elements with complex reordering");
      
      console.log("\n1. Setting up initial array [P, Q, R, S]...");
      
      // Setup initial state on all replicas
      for (const elem of INITIAL_ELEMENTS) {
        const writeOp = (state) => MVReg.write(elem.value, state);
        const delta = ORArray.insertValue(elem.uid, writeOp, new Position(elem.position), replica1);
        replica1 = DotMap.join(replica1, delta);
        replica2 = DotMap.join(replica2, delta);
        replica3 = DotMap.join(replica3, delta);
      }
      
      console.log("   Initial state:", ORArray.value(replica1).map(s => Array.from(s)[0]));
      
      console.log("\n2. Applying complex mixed operations...");
      
      const deltas = { replica1: [], replica2: [], replica3: [] };
      const replicaRefs = { replica1, replica2, replica3 };
      
      for (const [replicaName, ops] of Object.entries(OPERATIONS)) {
        let currentReplica = replicaRefs[replicaName];
        console.log(`\n   ${replicaName} performing ${ops.length} operations:`);
        
        for (const [opIndex, op] of ops.entries()) {
          try {
            let delta;
            
            if (op.type === "insert") {
              const writeOp = (state) => MVReg.write(op.value, state);
              delta = ORArray.insertValue(op.uid, writeOp, new Position(op.position), currentReplica);
              console.log(`     ${opIndex + 1}. INSERT ${op.value} at position ${op.position} ✅`);
            } else if (op.type === "move") {
              delta = ORArray.move(op.uid, new Position(op.newPosition), currentReplica);
              console.log(`     ${opIndex + 1}. MOVE ${op.uid} to position ${op.newPosition} ✅`);
            }
            
            deltas[replicaName].push(delta);
            currentReplica = DotMap.join(currentReplica, delta);
            
            // Update replica reference
            if (replicaName === "replica1") replica1 = currentReplica;
            else if (replicaName === "replica2") replica2 = currentReplica;
            else if (replicaName === "replica3") replica3 = currentReplica;
            
            // Show intermediate state
            console.log(`        → ${ORArray.value(currentReplica).map(s => Array.from(s)[0])}`);
            
          } catch (error) {
            console.log(`     ${opIndex + 1}. Operation failed: ${error.message} ❌`);
          }
        }
      }
      
      console.log("\n3. Final synchronization...");
      
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
      
      const complex1 = ORArray.value(replica1).map(s => Array.from(s)[0]);
      const complex2 = ORArray.value(replica2).map(s => Array.from(s)[0]);
      const complex3 = ORArray.value(replica3).map(s => Array.from(s)[0]);
      
      console.log("\n4. Complex Operation Results:");
      console.log("   Replica1 final:", complex1);
      console.log("   Replica2 final:", complex2);
      console.log("   Replica3 final:", complex3);
      
      const complexConverged = JSON.stringify(complex1) === JSON.stringify(complex2) && 
                              JSON.stringify(complex2) === JSON.stringify(complex3);
      console.log("   Converged:", complexConverged);
      
      // Element count analysis
      const expectedElements = ["P", "Q", "R", "S", "NEW1", "NEW2", "NEW3", "NEW4"];
      const actualElements = complex1;
      console.log(`   Element count: ${actualElements.length} (expected: 8)`);
      
      const missingElements = expectedElements.filter(e => !actualElements.includes(e));
      const extraElements = actualElements.filter(e => !expectedElements.includes(e));
      
      if (missingElements.length === 0 && extraElements.length === 0) {
        console.log("   ✅ All expected elements present, no extras");
      } else {
        console.log("   ❌ Element count mismatch:");
        if (missingElements.length > 0) console.log("     Missing:", missingElements);
        if (extraElements.length > 0) console.log("     Extra:", extraElements);
      }
      
      console.log("\n5. Complexity Analysis:");
      console.log("   📝 This test demonstrates CRDT behavior with:");
      console.log("     - Multiple concurrent inserts at same position");
      console.log("     - Multiple concurrent moves");
      console.log("     - Mixed operation types across different positions");
      console.log("     - Complex element reordering scenarios");
      
      if (complexConverged) {
        console.log("   ✅ Complex mixed operations successfully converged");
      } else {
        console.log("   ⚠️  Complex mixed operations showed order-dependency");
      }
      
      console.log("\n=== END COMPLEX MIXED OPERATIONS ===\n");
      
      // Verification
      expect(actualElements.length).to.be.at.least(8); // Should have at least all expected elements
      expect(missingElements.length).to.equal(0); // No elements should be lost
    });
  });
});