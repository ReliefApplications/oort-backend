/* eslint-disable prettier/prettier */

/* Context:
In the Guyane Alimentaide 9734 project, some orphan aids were created, when there parent prescription was deleted.
This script was built to target and delete those aids.
Once you have tested it enough and want to apply it, simply remove "find" by "deleteMany" in the Step 2.
*/

// Step 1: Get all referenced IDs
const allReferencedIds = db.getCollection("records").distinct("data.all_aids");

// Step 2: Find records not referenced
const unusedAids = db.getCollection("records").find({
  _id: { $nin: allReferencedIds.map(id => ObjectId(id)) },
  "data.adding_from_family": true,
  "data.type": {$ne: "aide nominative - 1ère fois"},
  resource: ObjectId('64e6e0933c7bf3962bf4f04c'),
});

// Logging
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
unusedAids.toArray()[unusedAids.count() - 2]._id
console.log("unused aids:")
unusedAids.count()
console.log("total aids:")
db.getCollection("records").find({
  resource: ObjectId('64e6e0933c7bf3962bf4f04c'),
}).count();
