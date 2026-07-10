/**
 * A visit the family pre-logs so the guardian knows it is expected (F2.4).
 *
 * The point is rule #5 ("uniforms are context, never trust"): an unknown person in a
 * medic or utility uniform is exactly the costume elder-fraud scams use. A stranger is
 * only "expected" when the family logged the visit ahead of time (here) or the system
 * itself initiated an emergency. Clothing alone never grants trust.
 *
 * Editable configuration, not the append-only safety trail: families add and remove
 * these as plans change. When the stranger evaluator (a later slice) suppresses an
 * alert because a visit covered the moment, it records a copy of the label in the
 * append-only trail, so deleting the visit here never rewrites history.
 */
export interface ExpectedVisit {
  id: string;
  familyId: string;
  /** Who is expected, a plain label: "Nurse", "Plumber", "Meals delivery". */
  visitorLabel: string;
  /** Window the visit is expected within, as canonical ISO instants. */
  startsAt: string;
  endsAt: string;
  notes: string | null;
  createdAt: string;
}
