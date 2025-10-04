(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-METADATA u102)
(define-constant ERR-INVALID-CATEGORY u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-CONTRIB-ALREADY-EXISTS u105)
(define-constant ERR-CONTRIB-NOT-FOUND u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-MAX-CONTRIBS-EXCEEDED u108)
(define-constant ERR-INVALID-USER u109)
(define-constant ERR-INVALID-DESCRIPTION u110)
(define-constant ERR-INVALID-LOCATION u111)
(define-constant ERR-INVALID-DATA-TYPE u112)
(define-constant ERR-INVALID-VALIDATION-THRESHOLD u113)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u114)
(define-constant ERR-INVALID-UPDATE-PARAM u115)
(define-constant ERR-UPDATE-NOT-ALLOWED u116)
(define-constant ERR-INVALID-SUBMISSION-FEE u117)
(define-constant ERR-INVALID-REWARD-RATE u118)
(define-constant ERR-INVALID-EXPIRY u119)
(define-constant ERR-INVALID-POINTS u120)

(define-data-var next-contrib-id uint u0)
(define-data-var max-contribs uint u10000)
(define-data-var submission-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var reward-rate uint u10)
(define-data-var validation-threshold uint u3)

(define-map contributions
  uint
  {
    data-hash: (buff 32),
    metadata: (string-utf8 256),
    category: (string-utf8 50),
    timestamp: uint,
    submitter: principal,
    data-type: (string-utf8 50),
    description: (string-utf8 512),
    location: (string-utf8 100),
    status: bool,
    expiry: uint,
    points-awarded: uint
  }
)

(define-map contribs-by-hash
  (buff 32)
  uint)

(define-map contrib-updates
  uint
  {
    update-metadata: (string-utf8 256),
    update-description: (string-utf8 512),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-contribution (id uint))
  (map-get? contributions id)
)

(define-read-only (get-contrib-updates (id uint))
  (map-get? contrib-updates id)
)

(define-read-only (is-contrib-registered (hash (buff 32)))
  (is-some (map-get? contribs-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-metadata (meta (string-utf8 256)))
  (if (and (> (len meta) u0) (<= (len meta) u256))
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (or (is-eq cat "environment") (is-eq cat "biology") (is-eq cat "astronomy") (is-eq cat "physics"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-data-type (dtype (string-utf8 50)))
  (if (or (is-eq dtype "observation") (is-eq dtype "measurement") (is-eq dtype "photo") (is-eq dtype "sample"))
      (ok true)
      (err ERR-INVALID-DATA-TYPE))
)

(define-private (validate-description (desc (string-utf8 512)))
  (if (and (> (len desc) u0) (<= (len desc) u512))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (<= (len loc) u100)
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRY))
)

(define-private (validate-points (pts uint))
  (if (>= pts u0)
      (ok true)
      (err ERR-INVALID-POINTS))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-contribs (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-CONTRIBS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-contribs new-max)
    (ok true)
  )
)

(define-public (set-submission-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-SUBMISSION-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set submission-fee new-fee)
    (ok true)
  )
)

(define-public (set-reward-rate (new-rate uint))
  (begin
    (asserts! (and (> new-rate u0) (<= new-rate u50)) (err ERR-INVALID-REWARD-RATE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (set-validation-threshold (new-threshold uint))
  (begin
    (asserts! (and (> new-threshold u0) (<= new-threshold u10)) (err ERR-INVALID-VALIDATION-THRESHOLD))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set validation-threshold new-threshold)
    (ok true)
  )
)

(define-public (submit-contribution
  (data-hash (buff 32))
  (metadata (string-utf8 256))
  (category (string-utf8 50))
  (data-type (string-utf8 50))
  (description (string-utf8 512))
  (location (string-utf8 100))
  (expiry uint)
  (initial-points uint)
)
  (let (
        (next-id (var-get next-contrib-id))
        (current-max (var-get max-contribs))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-CONTRIBS-EXCEEDED))
    (try! (validate-hash data-hash))
    (try! (validate-metadata metadata))
    (try! (validate-category category))
    (try! (validate-data-type data-type))
    (try! (validate-description description))
    (try! (validate-location location))
    (try! (validate-expiry expiry))
    (try! (validate-points initial-points))
    (asserts! (is-none (map-get? contribs-by-hash data-hash)) (err ERR-CONTRIB-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get submission-fee) tx-sender authority-recipient))
    )
    (map-set contributions next-id
      {
        data-hash: data-hash,
        metadata: metadata,
        category: category,
        timestamp: block-height,
        submitter: tx-sender,
        data-type: data-type,
        description: description,
        location: location,
        status: false,
        expiry: expiry,
        points-awarded: initial-points
      }
    )
    (map-set contribs-by-hash data-hash next-id)
    (var-set next-contrib-id (+ next-id u1))
    (print { event: "contribution-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-contribution
  (contrib-id uint)
  (update-metadata (string-utf8 256))
  (update-description (string-utf8 512))
)
  (let ((contrib (map-get? contributions contrib-id)))
    (match contrib
      c
        (begin
          (asserts! (is-eq (get submitter c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (get status c)) (err ERR-UPDATE-NOT-ALLOWED))
          (try! (validate-metadata update-metadata))
          (try! (validate-description update-description))
          (map-set contributions contrib-id
            {
              data-hash: (get data-hash c),
              metadata: update-metadata,
              category: (get category c),
              timestamp: block-height,
              submitter: (get submitter c),
              data-type: (get data-type c),
              description: update-description,
              location: (get location c),
              status: (get status c),
              expiry: (get expiry c),
              points-awarded: (get points-awarded c)
            }
          )
          (map-set contrib-updates contrib-id
            {
              update-metadata: update-metadata,
              update-description: update-description,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "contribution-updated", id: contrib-id })
          (ok true)
        )
      (err ERR-CONTRIB-NOT-FOUND)
    )
  )
)

(define-public (approve-contribution (contrib-id uint))
  (let ((contrib (map-get? contributions contrib-id)))
    (match contrib
      c
        (begin
          (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
          (asserts! (not (get status c)) (err ERR-INVALID-STATUS))
          (map-set contributions contrib-id
            (merge c { status: true, timestamp: block-height })
          )
          (print { event: "contribution-approved", id: contrib-id })
          (ok true)
        )
      (err ERR-CONTRIB-NOT-FOUND)
    )
  )
)

(define-public (get-contrib-count)
  (ok (var-get next-contrib-id))
)

(define-public (check-contrib-existence (hash (buff 32)))
  (ok (is-contrib-registered hash))
)