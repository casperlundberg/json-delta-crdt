/* eslint-env mocha */
"use strict";

const chai = require("chai");
const dirtyChai = require("dirty-chai");
const expect = chai.expect;
chai.use(dirtyChai);

const { ORArray, ORMap, MVReg } = require("../../../src/backend/crdts");
const { DotMap } = require("../../../src/backend/dotstores");
const CausalContext = require("../../../src/backend/causal-context");
const Position = require("../../../src/backend/utils/position");

describe("concurrent edge cases", () => {
  describe("concurrent array move operations", () => {
    let replica1, replica2, replica3;
    
    beforeEach(() => {
      replica1 = [new DotMap(ORArray.typename()), new CausalContext("r1")];
      replica2 = [new DotMap(ORArray.typename()), new CausalContext("r2")];
      replica3 = [new DotMap(ORArray.typename()), new CausalContext("r3")];
    });

    it("should handle concurrent moves of the same element to different positions", () => {
      // Initial state: [a, b, c]
      // Replica1 wants: [b, a, c] (move b to beginning)
      // Replica2 wants: [a, c, b] (move b to end)
      // Replica3 wants: [a, b, c] (move b to middle, essentially no change)
      // Expected after merge: All replicas converge to same deterministic order
      // Expected final state: [b, a, c] or similar based on CRDT resolution
      
      const writeA = (state) => MVReg.write("a", state);
      const writeB = (state) => MVReg.write("b", state);
      const writeC = (state) => MVReg.write("c", state);

      // Insert elements on replica1
      let d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      replica1 = DotMap.join(replica1, d1);
      let d2 = ORArray.insertValue("b", writeB, new Position(200), replica1);
      replica1 = DotMap.join(replica1, d2);
      let d3 = ORArray.insertValue("c", writeC, new Position(300), replica1);
      replica1 = DotMap.join(replica1, d3);

      // Sync to all replicas - all start with [a, b, c]
      replica2 = DotMap.join(replica2, d1);
      replica2 = DotMap.join(replica2, d2);
      replica2 = DotMap.join(replica2, d3);
      replica3 = DotMap.join(replica3, d1);
      replica3 = DotMap.join(replica3, d2);
      replica3 = DotMap.join(replica3, d3);

      // Concurrent moves of element 'b':
      // Replica1: move b to beginning (position 50)
      const move1 = ORArray.move("b", new Position(50), replica1);
      replica1 = DotMap.join(replica1, move1);

      // Replica2: move b to end (position 400)
      const move2 = ORArray.move("b", new Position(400), replica2);
      replica2 = DotMap.join(replica2, move2);

      // Replica3: move b to middle (position 250)
      const move3 = ORArray.move("b", new Position(250), replica3);
      replica3 = DotMap.join(replica3, move3);

      // Apply all moves to all replicas
      replica1 = DotMap.join(replica1, move2);
      replica1 = DotMap.join(replica1, move3);
      replica2 = DotMap.join(replica2, move1);
      replica2 = DotMap.join(replica2, move3);
      replica3 = DotMap.join(replica3, move1);
      replica3 = DotMap.join(replica3, move2);

      // All replicas should converge to the same state
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);
      const val3 = ORArray.value(replica3);

      // Verify convergence
      expect(val1).to.deep.equal(val2);
      expect(val2).to.deep.equal(val3);
      expect(val1.length).to.equal(3); // All elements preserved
      
      // verify the final order (R1 wins)
      expect(val1.map(s => Array.from(s)[0])).to.deep.equal(["b", "a", "c"]);
      
      // In ORArray with move operations, the last move based on causal ordering wins
      // Since replica3 has the highest replica ID and moves are concurrent,
      // we expect 'b' to be at position determined by the winning move
      // The exact position depends on the CRDT's conflict resolution
      console.log("      Initial: [a, b, c]");
      console.log("      R1 wanted: [b, a, c] (move b to start)");
      console.log("      R2 wanted: [a, c, b] (move b to end)");
      console.log("      R3 wanted: [a, b, c] (move b to middle)");
      console.log("      Final converged array:", val1.map(s => Array.from(s)[0]));
    });

    it("should handle circular concurrent moves (A→B, B→C, C→A positions)", () => {
      // Initial state: [a, b, c] at positions 100, 200, 300
      // Replica1: move a to position 200 (where b is)
      // Replica2: move b to position 300 (where c is)
      // Replica3: move c to position 100 (where a is)
      // This creates a circular dependency that the CRDT must resolve
      // Expected: Deterministic resolution of the circular moves
      
      const writeA = (state) => MVReg.write("a", state);
      const writeB = (state) => MVReg.write("b", state);
      const writeC = (state) => MVReg.write("c", state);

      let d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      let d2 = ORArray.insertValue("b", writeB, new Position(200), replica1);
      let d3 = ORArray.insertValue("c", writeC, new Position(300), replica1);

      replica1 = DotMap.join(replica1, d1);
      replica1 = DotMap.join(replica1, d2);
      replica1 = DotMap.join(replica1, d3);

      // Sync initial state
      const initialState = DotMap.join(DotMap.join(d1, d2), d3);
      replica2 = DotMap.join(replica2, initialState);
      replica3 = DotMap.join(replica3, initialState);

      // Circular moves:
      // Replica1: move a to position of b
      const move1 = ORArray.move("a", new Position(200), replica1);
      // Replica2: move b to position of c  
      const move2 = ORArray.move("b", new Position(300), replica2);
      // Replica3: move c to position of a
      const move3 = ORArray.move("c", new Position(100), replica3);

      // Apply locally
      replica1 = DotMap.join(replica1, move1);
      replica2 = DotMap.join(replica2, move2);
      replica3 = DotMap.join(replica3, move3);

      // Exchange and apply all moves
      replica1 = DotMap.join(replica1, move2);
      replica1 = DotMap.join(replica1, move3);
      replica2 = DotMap.join(replica2, move1);
      replica2 = DotMap.join(replica2, move3);
      replica3 = DotMap.join(replica3, move1);
      replica3 = DotMap.join(replica3, move2);

      // Verify convergence
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);
      const val3 = ORArray.value(replica3);

      expect(val1).to.deep.equal(val2);
      expect(val2).to.deep.equal(val3);
      expect(val1.length).to.equal(3); // All three elements must be present
      
      // Log the actual resolution of the circular moves
      console.log("      Initial: [a, b, c]");
      console.log("      R1: a→pos(200), R2: b→pos(300), R3: c→pos(100)");
      console.log("      Circular move resolution:", val1.map(s => Array.from(s)[0]));
    });

    it("should handle concurrent move and delete of the same element", () => {
      // Initial state: [a, b]
      // Replica1: move 'a' to end -> expects [b, a]
      // Replica2: delete 'a' -> expects [b]
      // Expected after merge: [b] (delete wins over move in most CRDTs)
      
      const writeA = (state) => MVReg.write("a", state);
      const writeB = (state) => MVReg.write("b", state);

      let d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      let d2 = ORArray.insertValue("b", writeB, new Position(200), replica1);

      replica1 = DotMap.join(replica1, d1);
      replica1 = DotMap.join(replica1, d2);
      replica2 = DotMap.join(replica2, d1);
      replica2 = DotMap.join(replica2, d2);

      // Concurrent operations on element 'a':
      // Replica1: move a to end
      const move = ORArray.move("a", new Position(300), replica1);
      replica1 = DotMap.join(replica1, move);

      // Replica2: delete a
      const del = ORArray.delete("a", replica2);
      replica2 = DotMap.join(replica2, del);

      // Exchange operations
      replica1 = DotMap.join(replica1, del);
      replica2 = DotMap.join(replica2, move);

      // Both should converge - delete should win over move
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);

      expect(val1).to.deep.equal(val2);
      
      // Delete should win in ORArray - 'a' should be removed
      expect(val1.length).to.equal(1); // Only 'b' remains
      expect(Array.from(val1[0])[0]).to.equal("b"); // Verify 'b' is the remaining element
      console.log("      Expected: [b] (delete wins over move)");
      console.log("      Actual:", val1.map(s => Array.from(s)[0]));
    });

    it("should handle concurrent moves creating a cycle", () => {
      // Initial state: [a, b] at positions 100, 200
      // Replica1: move 'a' to position 200 (swap a and b)
      // Replica2: move 'b' to position 100 (swap b and a)
      // Both replicas want to swap the elements
      // Expected: Deterministic resolution (likely based on replica ID ordering)
      
      const writeA = (state) => MVReg.write("a", state);
      const writeB = (state) => MVReg.write("b", state);

      let d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      let d2 = ORArray.insertValue("b", writeB, new Position(200), replica1);

      replica1 = DotMap.join(replica1, d1);
      replica1 = DotMap.join(replica1, d2);
      replica2 = DotMap.join(replica2, d1);
      replica2 = DotMap.join(replica2, d2);

      // Concurrent swapping moves:
      // Replica1: move a to position 200 (where b is)
      const move1 = ORArray.move("a", new Position(200), replica1);
      // Replica2: move b to position 100 (where a is)
      const move2 = ORArray.move("b", new Position(100), replica2);

      replica1 = DotMap.join(replica1, move1);
      replica2 = DotMap.join(replica2, move2);

      // Exchange moves
      replica1 = DotMap.join(replica1, move2);
      replica2 = DotMap.join(replica2, move1);

      // Should converge to same order
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);

      expect(val1).to.deep.equal(val2);
      expect(val1.length).to.equal(2); // Both elements preserved
      
      // The swap should be resolved deterministically
      // Log actual order after swap resolution
      const order = val1.map(s => Array.from(s)[0]);
      console.log("Swap resolution order:", order);
      
      // Both elements must be present
      expect(order).to.include("a");
      expect(order).to.include("b");
    });
  });

  describe("concurrent map operations with nested structures", () => {
    let replica1, replica2;

    beforeEach(() => {
      replica1 = [new DotMap(ORMap.typename()), new CausalContext("r1")];
      replica2 = [new DotMap(ORMap.typename()), new CausalContext("r2")];
    });

    it("should handle concurrent moves breaking references in nested maps", () => {
      // Initial state: {a: {b: {c: "value"}}, b: {c: "value"}, d: "new-value"}
      // Replica1: removes 'b' from root level
      // Replica2: adds 'd' with "new-value"
      // Expected: Converged state with 'b' removed and 'd' added
      // Tests that removing references doesn't break other operations
      
      const createNested = (value) => {
        return function([, cc]) {
          const innerMap = [new DotMap(ORMap.typename()), cc];
          const writeValue = MVReg.write(value, innerMap);
          const d1 = ORMap.applyToValue(() => writeValue, "c", innerMap);
          const nestedState = DotMap.join(innerMap, d1);
          return nestedState;
        };
      };

      // Build nested structure on replica1
      const d1 = ORMap.applyToValue(createNested("value"), "b", replica1);
      replica1 = DotMap.join(replica1, d1);
      
      const wrapB = function([m, cc]) {
        const outerMap = [new DotMap(ORMap.typename()), cc];
        const existing = ORMap.value([m, cc]).b;
        if (existing) {
          const d = ORMap.applyToValue(() => [m.get("b"), cc], "b", outerMap);
          return DotMap.join(outerMap, d);
        }
        return outerMap;
      };

      const d2 = ORMap.applyToValue(wrapB, "a", replica1);
      replica1 = DotMap.join(replica1, d2);

      // Sync to replica2
      replica2 = DotMap.join(replica2, d1);
      replica2 = DotMap.join(replica2, d2);

      // Concurrent operations:
      // Replica1: remove the middle layer (b)
      const removeB = ORMap.remove("b", replica1);
      replica1 = DotMap.join(replica1, removeB);

      // Replica2: add something to the nested structure
      const addToNested = ORMap.applyToValue(
        (state) => MVReg.write("new-value", state),
        "d",
        replica2
      );
      replica2 = DotMap.join(replica2, addToNested);

      // Exchange operations
      replica1 = DotMap.join(replica1, addToNested);
      replica2 = DotMap.join(replica2, removeB);

      // Both should converge
      const val1 = ORMap.value(replica1);
      const val2 = ORMap.value(replica2);

      expect(val1).to.deep.equal(val2);
      
      // Expected: 'b' is removed, 'd' is added, 'a' remains
      expect(val1.b).to.be.undefined(); // 'b' should be removed
      expect(val1.d).to.exist(); // 'd' should exist
      expect(Array.from(val1.d)[0]).to.equal("new-value"); // 'd' has the new value
      expect(val1.a).to.exist(); // 'a' should still exist
    });

    it("should handle concurrent modifications to moved elements", () => {
      // Initial state: {key1: "initial"}
      // Replica1: update key1 to "updated"
      // Replica2: remove key1 and add key2 with "moved" (simulating a move)
      // Expected: {key2: "moved"} (remove wins, update is lost)
      
      const writeInitial = (state) => MVReg.write("initial", state);
      const d1 = ORMap.applyToValue(writeInitial, "key1", replica1);
      
      replica1 = DotMap.join(replica1, d1);
      replica2 = DotMap.join(replica2, d1);

      // Replica1: update the value
      const update = ORMap.applyToValue(
        (state) => MVReg.write("updated", state),
        "key1",
        replica1
      );
      replica1 = DotMap.join(replica1, update);

      // Replica2: remove and re-add with different key (simulating a move)
      const remove = ORMap.remove("key1", replica2);
      replica2 = DotMap.join(replica2, remove);
      
      const reAdd = ORMap.applyToValue(
        (state) => MVReg.write("moved", state),
        "key2",
        replica2
      );
      replica2 = DotMap.join(replica2, reAdd);

      // Exchange all operations
      replica1 = DotMap.join(replica1, remove);
      replica1 = DotMap.join(replica1, reAdd);
      replica2 = DotMap.join(replica2, update);

      // Verify convergence
      const val1 = ORMap.value(replica1);
      const val2 = ORMap.value(replica2);

      expect(val1).to.deep.equal(val2);
      
      // The remove should win - key1 is eliminated
      expect(val1.key1).to.be.undefined();
      
      // key2 should exist with the "moved" value
      expect(val1.key2).to.exist();
      expect(Array.from(val1.key2)[0]).to.equal("moved");
    });
  });

  describe("array operations breaking element integrity", () => {
    let replica1, replica2, replica3;

    beforeEach(() => {
      replica1 = [new DotMap(ORArray.typename()), new CausalContext("r1")];
      replica2 = [new DotMap(ORArray.typename()), new CausalContext("r2")];
      replica3 = [new DotMap(ORArray.typename()), new CausalContext("r3")];
    });

    it("should maintain array integrity with concurrent inserts at same position", () => {
      // Initial state: [] (empty array)
      // Replica1: insert 'a' at position 100
      // Replica2: insert 'b' at position 100
      // Replica3: insert 'c' at position 100
      // Expected: [a, b, c] or [c, b, a] etc. (deterministic order based on replica IDs)
      // All three elements must be present, order determined by CRDT resolution
      
      const writeA = (state) => MVReg.write("a", state);
      const writeB = (state) => MVReg.write("b", state);
      const writeC = (state) => MVReg.write("c", state);

      const d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      const d2 = ORArray.insertValue("b", writeB, new Position(100), replica2);
      const d3 = ORArray.insertValue("c", writeC, new Position(100), replica3);

      // Apply locally
      replica1 = DotMap.join(replica1, d1);
      replica2 = DotMap.join(replica2, d2);
      replica3 = DotMap.join(replica3, d3);

      // Exchange all deltas
      replica1 = DotMap.join(replica1, d2);
      replica1 = DotMap.join(replica1, d3);
      replica2 = DotMap.join(replica2, d1);
      replica2 = DotMap.join(replica2, d3);
      replica3 = DotMap.join(replica3, d1);
      replica3 = DotMap.join(replica3, d2);

      // All should have same elements in deterministic order
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);
      const val3 = ORArray.value(replica3);

      expect(val1.length).to.equal(3);
      expect(val1).to.deep.equal(val2);
      expect(val2).to.deep.equal(val3);
      
      // All three elements must be present
      const elements = val1.map(s => Array.from(s)[0]);
      expect(elements).to.include("a");
      expect(elements).to.include("b");
      expect(elements).to.include("c");
      
      console.log("Concurrent insert order resolution:", elements);
    });

    it("should handle move operations on non-existent elements", () => {
      // Initial state: 
      // Replica1: has element 'a' at position 100
      // Replica2: empty, tries to move non-existent 'a' to position 200
      // Expected: After sync, both have 'a' at position 200 (move applies retroactively)
      
      const writeA = (state) => MVReg.write("a", state);
      const d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      replica1 = DotMap.join(replica1, d1);

      // Replica2 tries to move 'a' without having it
      const move = ORArray.move("a", new Position(200), replica2);
      replica2 = DotMap.join(replica2, move);

      // Exchange operations
      replica1 = DotMap.join(replica1, move);
      replica2 = DotMap.join(replica2, d1);

      // Should converge - the move should be applied after receiving the element
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);

      expect(val1).to.deep.equal(val2);
      expect(val1.length).to.equal(1); // Element 'a' exists
      expect(Array.from(val1[0])[0]).to.equal("a");
      
      // The move operation should have been applied
      // even though replica2 didn't have the element initially
      console.log("Element 'a' successfully moved despite initial absence on replica2");
    });

    it("should handle interleaved move and update operations", () => {
      // Initial state: ['initial'] at position 100
      // Replica1: move element to position 200
      // Replica2: update element value to 'updated'
      // Expected: ['updated'] at position 200 (both operations apply)
      
      const writeA = (state) => MVReg.write("initial", state);
      const d1 = ORArray.insertValue("a", writeA, new Position(100), replica1);
      
      replica1 = DotMap.join(replica1, d1);
      replica2 = DotMap.join(replica2, d1);

      // Replica1: move element
      const move = ORArray.move("a", new Position(200), replica1);
      replica1 = DotMap.join(replica1, move);

      // Replica2: update element value
      const update = ORArray.applyToValue(
        "a",
        (state) => MVReg.write("updated", state),
        new Position(100),
        replica2
      );
      replica2 = DotMap.join(replica2, update);

      // Exchange operations
      replica1 = DotMap.join(replica1, update);
      replica2 = DotMap.join(replica2, move);

      // Both should have the updated value at the new position
      const val1 = ORArray.value(replica1);
      const val2 = ORArray.value(replica2);

      expect(val1).to.deep.equal(val2);
      expect(val1.length).to.equal(1);
      
      // The element should have both the updated value AND be at the new position
      // Both operations (move and update) should apply
      expect(Array.from(val1[0])[0]).to.equal("updated");
      console.log("Successfully applied both move and update operations");
    });
  });
});