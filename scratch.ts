import * as fs from "fs";
import * as path from "path";

async function main() {
  const schemaPath = path.join(__dirname, "prisma", "schema.prisma");
  let content = fs.readFileSync(schemaPath, "utf8");

  // 1. Add relations to OnlineLead model
  const onlineLeadTarget = "  followupStatus      OnlineLeadFollowupStatus? @relation(fields: [status], references: [id], onDelete: SetNull)";
  const onlineLeadReplacement = `${onlineLeadTarget}\n  sourceRelation      SourceMaster?             @relation(fields: [source_id], references: [id], onDelete: SetNull)\n  siteTypeRelation    SiteTypeMaster?           @relation(fields: [site_type_id], references: [id], onDelete: SetNull)`;
  
  if (content.includes(onlineLeadTarget) && !content.includes("sourceRelation      SourceMaster?")) {
    content = content.replace(onlineLeadTarget, onlineLeadReplacement);
    console.log("Added sourceRelation and siteTypeRelation to OnlineLead model.");
  } else {
    console.log("OnlineLead relations already present or target not found.");
  }

  // 2. Add onlineLeads relation to SourceMaster model
  const sourceMasterTarget = "  leads     LeadMaster[]";
  const sourceMasterReplacement = `${sourceMasterTarget}\n  onlineLeads OnlineLead[]`;
  
  // To avoid incorrect replacements, let's locate the model SourceMaster block
  const sourceMasterStart = content.indexOf("model SourceMaster {");
  if (sourceMasterStart !== -1) {
    const nextCloseBrace = content.indexOf("}", sourceMasterStart);
    const block = content.substring(sourceMasterStart, nextCloseBrace);
    if (!block.includes("onlineLeads")) {
      const updatedBlock = block.replace(sourceMasterTarget, sourceMasterReplacement);
      content = content.substring(0, sourceMasterStart) + updatedBlock + content.substring(nextCloseBrace);
      console.log("Added onlineLeads to SourceMaster model.");
    }
  }

  // 3. Add onlineLeads relation to SiteTypeMaster model
  const siteTypeMasterStart = content.indexOf("model SiteTypeMaster {");
  if (siteTypeMasterStart !== -1) {
    const nextCloseBrace = content.indexOf("}", siteTypeMasterStart);
    const block = content.substring(siteTypeMasterStart, nextCloseBrace);
    if (!block.includes("onlineLeads")) {
      const updatedBlock = block.replace(sourceMasterTarget, sourceMasterReplacement);
      content = content.substring(0, siteTypeMasterStart) + updatedBlock + content.substring(nextCloseBrace);
      console.log("Added onlineLeads to SiteTypeMaster model.");
    }
  }

  fs.writeFileSync(schemaPath, content, "utf8");
  console.log("schema.prisma updated successfully!");
}
main()
  .catch(console.error)
  .finally(() => process.exit(0));
