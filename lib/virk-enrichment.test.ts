import { describe, expect, it } from "vitest";
import { mapVirkParticipantsToLeadFields } from "./virk-enrichment";

describe("mapVirkParticipantsToLeadFields", () => {
  it("finder stifter, direktør og fuldt ansvarlig person", () => {
    const payload = {
      hits: {
        hits: [
          {
            _source: {
              Vrvirksomhed: {
                deltagerRelation: [
                  {
                    deltager: { navn: "Anna Jensen" },
                    rolle: "Stifter",
                  },
                  {
                    deltager: { navn: "Bjarne Madsen" },
                    rolle: "Direktør",
                  },
                  {
                    deltager: { navn: "Carl Holm" },
                    rolle: "Fuldt ansvarlig deltager (FAD)",
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const mapped = mapVirkParticipantsToLeadFields(payload);
    expect(mapped.stifter).toBe("Anna Jensen");
    expect(mapped.direktor).toBe("Bjarne Madsen");
    expect(mapped.fuldtAnsvarligPerson).toBe("Carl Holm");
  });

  it("returnerer tomt resultat når roller ikke kan matches", () => {
    const payload = {
      hits: {
        hits: [{ _source: { Vrvirksomhed: { deltagerRelation: [{ deltager: { navn: "X" }, rolle: "Bestyrelse" }] } } }],
      },
    };
    expect(mapVirkParticipantsToLeadFields(payload)).toEqual({});
  });
});
