import { describe, expect, it } from "vitest";
import type { PersonAttributeType } from "@/services/bahmni/metadata";
import { hasFonasaRegistration, registryDetailsErrors, fonasaRegistrationConcept } from "./registryDetails";
import { buildPatientAttributeLayout } from "./patientAttributeLayout";
const types: PersonAttributeType[] = [
 {uuid:"n",name:"addressNumber"}, {uuid:"s",name:"fonasaSegment"}, {uuid:"p",name:"basicHealthInsurance"},
];
describe("Two native registry details", () => {
 it("requires number, admits S/N and never derives it from the address", () => {
  expect(registryDetailsErrors({},types)).toHaveProperty("n");
  expect(registryDetailsErrors({n:"S/N"},types)).toEqual({});
 });
 it.each(["NULL"," ".repeat(2),"1".repeat(21),"1\n2"])("rejects invalid number %s", (n) => {
  expect(registryDetailsErrors({n},types)).toHaveProperty("n");
 });
 it("requires a valid segment only for the verified FONASA concept", () => {
  expect(hasFonasaRegistration({p:fonasaRegistrationConcept},types)).toBe(true);
  expect(registryDetailsErrors({n:"1",p:fonasaRegistrationConcept},types)).toHaveProperty("s");
  for(const s of ["A","B","C","D"]) expect(registryDetailsErrors({n:"1",p:fonasaRegistrationConcept,s},types)).toEqual({});
  expect(hasFonasaRegistration({p:"FONASA"},types)).toBe(false);
  expect(registryDetailsErrors({n:"1",p:"other"},types)).toEqual({});
 });
 it("does not require unavailable metadata in clients that have not deployed the fields", () => {
  expect(registryDetailsErrors({},[])).toEqual({});
 });
 it("does not duplicate the two fields in generic additional-information sections", () => {
  const layout=buildPatientAttributeLayout(types);
  expect(layout.otherInformation.map(t=>t.name)).toEqual(["basicHealthInsurance"]);
 });
});
