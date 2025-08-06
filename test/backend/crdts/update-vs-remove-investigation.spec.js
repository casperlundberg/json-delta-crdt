/* eslint-env mocha */
"use strict";

const chai = require("chai");
const dirtyChai = require("dirty-chai");
const expect = chai.expect;
chai.use(dirtyChai);

const { ORMap, MVReg } = require("../../../src/backend/crdts");
const { DotMap } = require("../../../src/backend/dotstores");
const CausalContext = require("../../../src/backend/causal-context");

/*
 * ==========================================================================
 * CONFIGURABLE CRDT TEST TEMPLATE
 * ==========================================================================
 * 
 * Modify the INITIAL_STATE and OPERATIONS objects in each test to experiment
 * with different concurrent operation scenarios.
 * 
 * Supported operations:
 * - update: { key: "keyName", newValue: "newVal" }
 * - add: { key: "newKey", value: "val" }
 * - remove: { key: "keyToRemove" }
 * 
 * You can add multiple operations to each replica by adding more properties
 * to the replica1/replica2 objects.
 * ==========================================================================
 */

describe("Update vs Remove Operation Investigation", () => {
  let replica1, replica2;

  beforeEach(() => {
    replica1 = [new DotMap(ORMap.typename()), new CausalContext("r1")];
    replica2 = [new DotMap(ORMap.typename()), new CausalContext("r2")];
  });

  describe("Basic Update vs Remove Scenario", () => {
    it("should investigate why update wins over remove", () => {
      // ========================================
      // TEST CONFIGURATION - MODIFY THESE VALUES TO EXPERIMENT
      // ========================================
      
      // Starting state configuration
      const INITIAL_STATE = {
        key1: "initial_value",
        key2: "another_initial"
      };
      
      // Operation metadata
      const OPERATIONS = {
        // Replica1 operations (executed in order)
        replica1: [
          { type: "update", key: "key1", newValue: "updated_by_r1" }
          // Add more operations here: { type: "add", key: "newKey", value: "val" }
        ],
        
        // Replica2 operations (executed in order)
        replica2: [
          { type: "remove", key: "key1" },
          { type: "add", key: "key3", value: "added_by_r2" }
          // Add more operations here
        ]
      };
      
      // ========================================
      // TEST EXECUTION - Uses above configuration
      // ========================================
      
      console.log("\n=== INVESTIGATING UPDATE vs REMOVE BEHAVIOR ===");
      console.log("Configuration:");
      console.log("  Initial state:", INITIAL_STATE);
      console.log("  Replica1 will:", OPERATIONS.replica1);
      console.log("  Replica2 will:", OPERATIONS.replica2);
      
      // Setup initial state
      console.log("\n1. Setting up initial state...");
      for (const [key, value] of Object.entries(INITIAL_STATE)) {
        const writeOp = ORMap.applyToValue((state) => MVReg.write(value, state), key, replica1);
        replica1 = DotMap.join(replica1, writeOp);
        replica2 = DotMap.join(replica2, writeOp);
      }

      console.log("   Replica1:", ORMap.value(replica1));
      console.log("   Replica2:", ORMap.value(replica2));
      
      console.log("\n2. Applying concurrent operations...");
      
      // Execute Replica1 operations
      console.log(`   Replica1 executing ${OPERATIONS.replica1.length} operations:`);
      for (const op of OPERATIONS.replica1) {
        console.log(`     - ${op.type}: ${JSON.stringify(op)}`);
        
        if (op.type === "update") {
          const updateOp = ORMap.applyToValue(
            (state) => MVReg.write(op.newValue, state),
            op.key,
            replica1
          );
          replica1 = DotMap.join(replica1, updateOp);
        } else if (op.type === "add") {
          const addOp = ORMap.applyToValue(
            (state) => MVReg.write(op.value, state),
            op.key,
            replica1
          );
          replica1 = DotMap.join(replica1, addOp);
        } else if (op.type === "remove") {
          const removeOp = ORMap.remove(op.key, replica1);
          replica1 = DotMap.join(replica1, removeOp);
        }
      }
      console.log("   Replica1 final state:", ORMap.value(replica1));
      
      // Execute Replica2 operations  
      console.log(`   Replica2 executing ${OPERATIONS.replica2.length} operations:`);
      for (const op of OPERATIONS.replica2) {
        console.log(`     - ${op.type}: ${JSON.stringify(op)}`);
        
        if (op.type === "update") {
          const updateOp = ORMap.applyToValue(
            (state) => MVReg.write(op.newValue, state),
            op.key,
            replica2
          );
          replica2 = DotMap.join(replica2, updateOp);
        } else if (op.type === "add") {
          const addOp = ORMap.applyToValue(
            (state) => MVReg.write(op.value, state),
            op.key,
            replica2
          );
          replica2 = DotMap.join(replica2, addOp);
        } else if (op.type === "remove") {
          const removeOp = ORMap.remove(op.key, replica2);
          replica2 = DotMap.join(replica2, removeOp);
        }
      }
      console.log("   Replica2 final state:", ORMap.value(replica2));

      console.log("\n3. Exchanging operations (simulating network sync)...");
      
      // Store operations for exchange
      const replica1Ops = [];
      const replica2Ops = [];
      
      // Re-execute operations to capture deltas for exchange
      // Reset replicas to initial state for clean operation capture
      let r1_clean = [new DotMap(ORMap.typename()), new CausalContext("r1")];
      let r2_clean = [new DotMap(ORMap.typename()), new CausalContext("r2")];
      
      // Setup initial state on clean replicas
      for (const [key, value] of Object.entries(INITIAL_STATE)) {
        const writeOp = ORMap.applyToValue((state) => MVReg.write(value, state), key, r1_clean);
        r1_clean = DotMap.join(r1_clean, writeOp);
        r2_clean = DotMap.join(r2_clean, writeOp);
      }
      
      // Capture Replica1 operations
      for (const op of OPERATIONS.replica1) {
        let delta;
        if (op.type === "update") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.newValue, state), op.key, r1_clean);
        } else if (op.type === "add") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.value, state), op.key, r1_clean);
        } else if (op.type === "remove") {
          delta = ORMap.remove(op.key, r1_clean);
        }
        replica1Ops.push({name: op.type, delta: delta});
        r1_clean = DotMap.join(r1_clean, delta);
      }
      
      // Capture Replica2 operations
      for (const op of OPERATIONS.replica2) {
        let delta;
        if (op.type === "update") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.newValue, state), op.key, r2_clean);
        } else if (op.type === "add") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.value, state), op.key, r2_clean);
        } else if (op.type === "remove") {
          delta = ORMap.remove(op.key, r2_clean);
        }
        replica2Ops.push({name: op.type, delta: delta});
        r2_clean = DotMap.join(r2_clean, delta);
      }
      
      // Exchange operations
      console.log(`   Replica1 receiving ${replica2Ops.length} operations from Replica2:`);
      for (const op of replica2Ops) {
        console.log(`     - ${op.name}`);
        replica1 = DotMap.join(replica1, op.delta);
      }
      console.log("   Replica1 after receiving ops:", ORMap.value(replica1));
      
      console.log(`   Replica2 receiving ${replica1Ops.length} operations from Replica1:`);
      for (const op of replica1Ops) {
        console.log(`     - ${op.name}`);
        replica2 = DotMap.join(replica2, op.delta);
      }
      console.log("   Replica2 after receiving ops:", ORMap.value(replica2));

      console.log("\n4. Final convergence analysis:");
      const val1 = ORMap.value(replica1);
      const val2 = ORMap.value(replica2);
      
      console.log("   Final Replica1 state:", val1);
      console.log("   Final Replica2 state:", val2);
      console.log("   States are equal:", JSON.stringify(val1) === JSON.stringify(val2));
      
      // Log the internal state for deeper analysis
      console.log("\n5. Internal state analysis:");
      try {
        console.log("   Replica1 has key1:", replica1[0].get ? replica1[0].get("key1") !== undefined : "unknown");
        console.log("   Replica2 has key1:", replica2[0].get ? replica2[0].get("key1") !== undefined : "unknown");
      } catch (e) {
        console.log("   Could not analyze internal state:", e.message);
      }
      
      // Verify convergence (they should converge)
      expect(val1).to.deep.equal(val2);
      
      // Document the actual behavior vs expected
      console.log("\n6. Behavior Analysis:");
      if (val1.key1 !== undefined) {
        console.log("   ❌ UNEXPECTED: key1 still exists with value:", Array.from(val1.key1));
        console.log("   📝 FINDING: Update operation was preserved despite remove operation");
        console.log("   📝 THEORY: This CRDT uses additive conflict resolution");
      } else {
        console.log("   ✅ EXPECTED: key1 was removed as expected");
        console.log("   📝 FINDING: Remove operation won over update operation");
      }
      
      if (val1.key2 !== undefined) {
        console.log("   ✅ EXPECTED: key2 exists with value:", Array.from(val1.key2));
      }
      
      console.log("\n=== END INVESTIGATION ===\n");
    });

    it("should test operation order dependency (Replica2 operations first)", () => {
      // ========================================
      // TEST CONFIGURATION - REVERSE ORDER TEST
      // ========================================
      
      // Same starting state as previous test
      const INITIAL_STATE = {
        key1: "initial_value",
        key2: "another_initial"
      };
      
      // SAME operations but we'll apply Replica2's operations FIRST
      const OPERATIONS = {
        replica1: [
          { type: "update", key: "key1", newValue: "updated_by_r1" }
        ],
        replica2: [
          { type: "remove", key: "key1" },
          { type: "add", key: "key3", value: "added_by_r2" }
        ]
      };
      
      // ========================================
      // TEST EXECUTION - REPLICA2 OPERATIONS FIRST
      // ========================================
      
      console.log("\n=== TESTING OPERATION ORDER DEPENDENCY ===");
      console.log("This test applies Replica2 operations BEFORE Replica1 operations");
      console.log("to determine if result depends on operation order or operation type hierarchy");
      console.log("\nConfiguration (identical to previous test):");
      console.log("  Initial state:", INITIAL_STATE);
      console.log("  Replica1 will:", OPERATIONS.replica1);
      console.log("  Replica2 will:", OPERATIONS.replica2);
      
      // Setup initial state
      console.log("\n1. Setting up initial state...");
      for (const [key, value] of Object.entries(INITIAL_STATE)) {
        const writeOp = ORMap.applyToValue((state) => MVReg.write(value, state), key, replica1);
        replica1 = DotMap.join(replica1, writeOp);
        replica2 = DotMap.join(replica2, writeOp);
      }

      console.log("   Both replicas:", ORMap.value(replica1));
      
      console.log("\n2. Applying concurrent operations (REPLICA2 FIRST)...");
      
      // Execute Replica2 operations FIRST this time
      console.log(`   Replica2 executing ${OPERATIONS.replica2.length} operations FIRST:`);
      for (const op of OPERATIONS.replica2) {
        console.log(`     - ${op.type}: ${JSON.stringify(op)}`);
        
        if (op.type === "update") {
          const updateOp = ORMap.applyToValue(
            (state) => MVReg.write(op.newValue, state),
            op.key,
            replica2
          );
          replica2 = DotMap.join(replica2, updateOp);
        } else if (op.type === "add") {
          const addOp = ORMap.applyToValue(
            (state) => MVReg.write(op.value, state),
            op.key,
            replica2
          );
          replica2 = DotMap.join(replica2, addOp);
        } else if (op.type === "remove") {
          const removeOp = ORMap.remove(op.key, replica2);
          replica2 = DotMap.join(replica2, removeOp);
        }
      }
      console.log("   Replica2 final state:", ORMap.value(replica2));
      
      // Execute Replica1 operations SECOND this time  
      console.log(`   Replica1 executing ${OPERATIONS.replica1.length} operations SECOND:`);
      for (const op of OPERATIONS.replica1) {
        console.log(`     - ${op.type}: ${JSON.stringify(op)}`);
        
        if (op.type === "update") {
          const updateOp = ORMap.applyToValue(
            (state) => MVReg.write(op.newValue, state),
            op.key,
            replica1
          );
          replica1 = DotMap.join(replica1, updateOp);
        } else if (op.type === "add") {
          const addOp = ORMap.applyToValue(
            (state) => MVReg.write(op.value, state),
            op.key,
            replica1
          );
          replica1 = DotMap.join(replica1, addOp);
        } else if (op.type === "remove") {
          const removeOp = ORMap.remove(op.key, replica1);
          replica1 = DotMap.join(replica1, removeOp);
        }
      }
      console.log("   Replica1 final state:", ORMap.value(replica1));

      console.log("\n3. Exchanging operations (simulating network sync)...");
      
      // Store operations for exchange (same logic as before)
      const replica1Ops = [];
      const replica2Ops = [];
      
      // Re-execute operations to capture deltas for exchange
      let r1_clean = [new DotMap(ORMap.typename()), new CausalContext("r1")];
      let r2_clean = [new DotMap(ORMap.typename()), new CausalContext("r2")];
      
      // Setup initial state on clean replicas
      for (const [key, value] of Object.entries(INITIAL_STATE)) {
        const writeOp = ORMap.applyToValue((state) => MVReg.write(value, state), key, r1_clean);
        r1_clean = DotMap.join(r1_clean, writeOp);
        r2_clean = DotMap.join(r2_clean, writeOp);
      }
      
      // Capture operations for exchange
      for (const op of OPERATIONS.replica1) {
        let delta;
        if (op.type === "update") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.newValue, state), op.key, r1_clean);
        } else if (op.type === "add") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.value, state), op.key, r1_clean);
        } else if (op.type === "remove") {
          delta = ORMap.remove(op.key, r1_clean);
        }
        replica1Ops.push({name: op.type, delta: delta});
        r1_clean = DotMap.join(r1_clean, delta);
      }
      
      for (const op of OPERATIONS.replica2) {
        let delta;
        if (op.type === "update") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.newValue, state), op.key, r2_clean);
        } else if (op.type === "add") {
          delta = ORMap.applyToValue((state) => MVReg.write(op.value, state), op.key, r2_clean);
        } else if (op.type === "remove") {
          delta = ORMap.remove(op.key, r2_clean);
        }
        replica2Ops.push({name: op.type, delta: delta});
        r2_clean = DotMap.join(r2_clean, delta);
      }
      
      // Exchange operations
      console.log(`   Replica1 receiving ${replica2Ops.length} operations from Replica2:`);
      for (const op of replica2Ops) {
        console.log(`     - ${op.name}`);
        replica1 = DotMap.join(replica1, op.delta);
      }
      console.log("   Replica1 after receiving ops:", ORMap.value(replica1));
      
      console.log(`   Replica2 receiving ${replica1Ops.length} operations from Replica1:`);
      for (const op of replica1Ops) {
        console.log(`     - ${op.name}`);
        replica2 = DotMap.join(replica2, op.delta);
      }
      console.log("   Replica2 after receiving ops:", ORMap.value(replica2));

      console.log("\n4. Final convergence analysis:");
      const val1 = ORMap.value(replica1);
      const val2 = ORMap.value(replica2);
      
      console.log("   Final Replica1 state:", val1);
      console.log("   Final Replica2 state:", val2);
      console.log("   States are equal:", JSON.stringify(val1) === JSON.stringify(val2));
      
      console.log("\n5. Order Dependency Analysis:");
      if (val1.key1 !== undefined) {
        console.log("   ✅ SAME RESULT: key1 still exists despite remove operation");
        console.log("   📝 CONCLUSION: Result is INDEPENDENT of operation execution order");
        console.log("   📝 FINDING: This confirms OPERATION TYPE HIERARCHY (update > remove)");
      } else {
        console.log("   ❌ DIFFERENT RESULT: key1 was successfully removed");
        console.log("   📝 CONCLUSION: Result DEPENDS on operation execution order"); 
        console.log("   📝 FINDING: This would suggest FIRST-WRITER-WINS or timestamp-based resolution");
      }
      
      // Verify convergence
      expect(val1).to.deep.equal(val2);
      
      console.log("\n=== END ORDER DEPENDENCY TEST ===\n");
    });
  });

  describe("Detailed Operation Order Investigation", () => {
    it("should test different operation application orders", () => {
      console.log("\n=== OPERATION ORDER INVESTIGATION ===");
      
      // Test 1: Update first, then remove
      console.log("\n--- Test 1: Apply Update BEFORE Remove ---");
      let test1_replica = [new DotMap(ORMap.typename()), new CausalContext("test1")];
      
      const init1 = ORMap.applyToValue((state) => MVReg.write("initial", state), "key1", test1_replica);
      test1_replica = DotMap.join(test1_replica, init1);
      console.log("Initial:", ORMap.value(test1_replica));
      
      const update1 = ORMap.applyToValue((state) => MVReg.write("updated", state), "key1", test1_replica);
      test1_replica = DotMap.join(test1_replica, update1);
      console.log("After update:", ORMap.value(test1_replica));
      
      const remove1 = ORMap.remove("key1", test1_replica);
      test1_replica = DotMap.join(test1_replica, remove1);
      console.log("After remove:", ORMap.value(test1_replica));
      
      // Test 2: Remove first, then update
      console.log("\n--- Test 2: Apply Remove BEFORE Update ---");
      let test2_replica = [new DotMap(ORMap.typename()), new CausalContext("test2")];
      
      const init2 = ORMap.applyToValue((state) => MVReg.write("initial", state), "key1", test2_replica);
      test2_replica = DotMap.join(test2_replica, init2);
      console.log("Initial:", ORMap.value(test2_replica));
      
      const remove2 = ORMap.remove("key1", test2_replica);
      test2_replica = DotMap.join(test2_replica, remove2);
      console.log("After remove:", ORMap.value(test2_replica));
      
      // This should fail if trying to update non-existent key
      try {
        const update2 = ORMap.applyToValue((state) => MVReg.write("updated", state), "key1", test2_replica);
        test2_replica = DotMap.join(test2_replica, update2);
        console.log("After update:", ORMap.value(test2_replica));
      } catch (error) {
        console.log("Update after remove failed:", error.message);
      }
      
      console.log("=== END ORDER INVESTIGATION ===\n");
    });
  });

  describe("Causal Context Analysis", () => {
    it("should examine causal context during update vs remove", () => {
      console.log("\n=== CAUSAL CONTEXT ANALYSIS ===");
      
      // Setup initial state
      const writeInitial = (state) => MVReg.write("initial", state);
      const d1 = ORMap.applyToValue(writeInitial, "key1", replica1);
      
      replica1 = DotMap.join(replica1, d1);
      replica2 = DotMap.join(replica2, d1);
      
      console.log("Initial causal contexts:");
      console.log("  Replica1 CC:", replica1[1].toString());
      console.log("  Replica2 CC:", replica2[1].toString());
      
      // Apply operations and track causal context changes
      const update = ORMap.applyToValue(
        (state) => MVReg.write("updated", state),
        "key1",
        replica1
      );
      replica1 = DotMap.join(replica1, update);
      console.log("\nAfter update operation:");
      console.log("  Replica1 CC:", replica1[1].toString());
      console.log("  Update delta CC:", update[1].toString());
      
      const remove = ORMap.remove("key1", replica2);
      replica2 = DotMap.join(replica2, remove);
      console.log("\nAfter remove operation:");
      console.log("  Replica2 CC:", replica2[1].toString());
      console.log("  Remove delta CC:", remove[1].toString());
      
      // Exchange operations
      const replica1_before_exchange = DotMap.join([...replica1], [undefined, new CausalContext()]);
      replica1 = DotMap.join(replica1, remove);
      console.log("\nReplica1 after receiving remove:");
      console.log("  CC:", replica1[1].toString());
      console.log("  Value:", ORMap.value(replica1));
      
      replica2 = DotMap.join(replica2, update);
      console.log("\nReplica2 after receiving update:");
      console.log("  CC:", replica2[1].toString());
      console.log("  Value:", ORMap.value(replica2));
      
      console.log("\n=== END CAUSAL CONTEXT ANALYSIS ===\n");
      
      // Verify final state
      const val1 = ORMap.value(replica1);
      const val2 = ORMap.value(replica2);
      expect(val1).to.deep.equal(val2);
    });
  });
});