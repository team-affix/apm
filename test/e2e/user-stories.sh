#!/usr/bin/env bash
# End-to-end test of every DPM user story, with real Kubo nodes, a real dpm-server that checks packages with
# `unilog check`, and real Unilog packages. Run from the repo: `npm run test:e2e` (after `npm run build`).
#
# Needs:
#   ipfs     Kubo's command: on the PATH, or IPFS_BIN=/path/to/ipfs
#   unilog   on the PATH, or UNILOG_DIR=/path/to/a/built/unilog/checkout (one that supports "deps/*" roots)
#   ports    E2E_PORT (default 6100) up to E2E_PORT+300 must be free
#
# Each person has their own Kubo node, isolated (Kubo's test profile: no bootstrap, no discovery), so nodes only
# meet when a user connects them, as across the internet. All of them run on this machine, so each has its own
# port; on separate machines each would use the default port, and dpm would find it with nothing set.
set -u
APM=$(cd "$(dirname "$0")/../.." && pwd)
P=${E2E_PORT:-6100}; SRV=$((P + 300))
[ -f "$APM/dist/client/cli.js" ] || { echo "Build first: npm run build"; exit 2; }
IPFS_BIN=${IPFS_BIN:-$(command -v ipfs)} || true
[ -x "${IPFS_BIN:-}" ] || { echo "Needs Kubo's ipfs command: put it on the PATH or set IPFS_BIN"; exit 2; }

W=$(mktemp -d "${TMPDIR:-/tmp}/dpm-e2e-XXXXXX"); mkdir -p "$W/bin" "$W/kubo"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; wait 2>/dev/null; rm -rf "$W"; }
trap cleanup EXIT

# The commands users have: ipfs, dpm, dpm-server, unilog.
ln -s "$IPFS_BIN" "$W/bin/ipfs"
printf '#!/bin/sh\nexec node %s/dist/client/cli.js "$@"\n' "$APM" > "$W/bin/dpm"
printf '#!/bin/sh\nexec node %s/dist/server/main.js "$@"\n' "$APM" > "$W/bin/dpm-server"
if [ -n "${UNILOG_DIR:-}" ]; then
    printf '#!/bin/sh\nexec node %s/dist/cli.js "$@"\n' "$UNILOG_DIR" > "$W/bin/unilog"
elif ! command -v unilog >/dev/null; then
    echo "Needs unilog: put it on the PATH or set UNILOG_DIR"; exit 2
fi
chmod +x "$W/bin/"*
export PATH="$W/bin:$PATH"

PASS=0; FAIL=0
pass() { echo "  PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
expect_ok()   { local d=$1; shift; local out; if out=$("$@" 2>&1); then pass "$d"; else fail "$d: $out"; fi; }
expect_fail() { local d=$1 re=$2; shift 2; local out; if out=$("$@" 2>&1); then fail "$d: succeeded: $out"; elif grep -qE "$re" <<<"$out"; then pass "$d  [$(grep -E "$re" <<<"$out" | head -1 | cut -c1-110)]"; else fail "$d: wrong error: $out"; fi; }
story() { echo; echo "== $1"; }

# --- Kubo nodes: one per person, each with its own repo, API port and swarm port ---
declare -A API
kubo_node() { # name apiport swarmport
    export IPFS_PATH=$W/kubo/$1
    ipfs init --profile=test,unixfs-v1-2025 >/dev/null
    ipfs config Addresses.API /ip4/127.0.0.1/tcp/$2
    ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/$(( $2 + 200 ))
    ipfs config --json Addresses.Swarm "[\"/ip4/127.0.0.1/tcp/$3\"]"
    API[$1]=$2
}
start() { IPFS_PATH=$W/kubo/$1 ipfs daemon >"$W/kubo/$1.log" 2>&1 & echo $! > "$W/kubo/$1.pid"; PIDS+=($!); }
stop() { kill "$(cat "$W/kubo/$1.pid")"; sleep 1; }
as() { # run a command as a person: their Kubo, their dpm settings
    # (All the Kubos share this one machine, so each has its own port. On separate machines each would be on
    # the default port, and dpm would find it with nothing set.)
    local who=$1; shift
    IPFS_PATH=$W/kubo/$who DPM_HOME=$W/home/$who DPM_KUBO_API=http://127.0.0.1:${API[$who]} "$@"
}

story "Setup: everyone runs Kubo on their own machine (ipfs init once, ipfs daemon)"
kubo_node alice $((P+1)) $((P+101)); kubo_node bob $((P+2)) $((P+102));kubo_node carol $((P+3)) $((P+103)); kubo_node dave $((P+4)) $((P+104))
kubo_node eve $((P+5)) $((P+105)); kubo_node reader $((P+6)) $((P+106)); kubo_node server $((P+7)) $((P+107))
for n in alice bob carol dave eve reader server; do start $n; done
sleep 5
for n in alice bob carol dave eve reader server; do
    grep -q "Daemon is ready" "$W/kubo/$n.log" || { echo "$n's Kubo didn't start:"; cat "$W/kubo/$n.log"; exit 1; }
done
for n in alice bob carol dave eve reader server; do
    expect_ok "$n's dpm reaches their own Kubo (dpm node)" as $n dpm node
done

story "Server operator: dpm-server with its own Kubo, checking every package with 'unilog check', tokens required"
DPM_KUBO_API=http://127.0.0.1:${API[server]} PORT=$SRV DPM_DATA=$W/server-data \
    DPM_CHECK="unilog check" DPM_TOKENS=letmein dpm-server >"$W/server.log" 2>&1 &
PIDS+=($!); sleep 3
cat "$W/server.log" | sed 's/^/        /'
PEER=$(grep "swarm peering add" "$W/server.log" | head -1 | awk '{print $NF}')
[ -n "$PEER" ] && pass "server prints the address to peer with" || fail "server printed no peering address"

# Everyone registers the server with their Kubo (to push) and peers with it (to fetch).
for n in alice bob carol dave eve reader; do
    as $n ipfs pin remote service add home http://127.0.0.1:$SRV letmein
    as $n ipfs swarm peering add "$PEER" >/dev/null
done

# A Unilog project: dpm.json + unilog.json + modules.
project() { # who dir checkfolder
    mkdir -p "$2"
    as $1 dpm -C "$2" init >/dev/null
    (cd "$2" && unilog init --roots . 'deps/*' --check "$3" >/dev/null)
}
publish() { as $1 ipfs add -r -Q "$(as $1 dpm -C "$2" pack)"; }

story "Alice publishes a logic package (no dependencies) and pushes it"
A=$W/alice/logic; project alice "$A" Logic; mkdir -p "$A/Logic"
cat > "$A/Logic/Prelude.ul" <<'EOF'
# Basic logic: falsehood and conjunction.
false_elim : \C. false => C;
pair : \A B. A => B => and A B;
fst : \A B. and A B => A;
EOF
expect_ok "unilog check passes on Alice's project" bash -c "cd '$A' && unilog check"
LOGIC=$(publish alice "$A"); echo "        Logic v1 = $LOGIC"
[[ $LOGIC == bafy* ]] && pass "dpm pack + ipfs add gives a CID" || fail "no CID: $LOGIC"
PACKED=$(as alice dpm -C "$A" pack); [[ $(basename "$PACKED") =~ ^[0-9a-f-]{36}$ ]] && pass "dpm pack names its folder by a GUID ($(basename "$PACKED"))" || fail "pack folder: $PACKED"
[ ! -e "$PACKED/deps" ] && [ -f "$PACKED/dpm.json" ] && pass "packed folder has dpm.json and no deps/" || fail "packed folder contents"
expect_ok "Alice pushes Logic: ipfs pin remote add" as alice ipfs pin remote add --service=home "$LOGIC"

story "Bob builds on Alice's package: dpm add, dpm install (from the server), unilog check, publish, push"
B=$W/bob/ethics; project bob "$B" Ethics; mkdir -p "$B/Ethics"
cat > "$B/Ethics/Core.ul" <<'EOF'
import Logic.Prelude;
# Nothing is both wrong and permitted.
wrong_excludes_permitted : \X. wrong X => permitted X => false;
EOF
expect_ok "dpm add <Logic>" as bob dpm -C "$B" add "$LOGIC"
grep -q "$LOGIC" "$B/dpm.json" && pass "dpm.json lists the dependency" || fail "dpm.json"
expect_ok "dpm install (Bob is peered only with the server)" as bob dpm -C "$B" install
[ -f "$B/deps/$LOGIC/Logic/Prelude.ul" ] && pass "installed flat into deps/<cid>/" || fail "deps layout"
expect_ok "unilog check passes with the dependency installed" bash -c "cd '$B' && unilog check"
expect_ok "dpm ls" as bob dpm -C "$B" ls
ETHICS=$(publish bob "$B"); echo "        Ethics v1 = $ETHICS"
expect_ok "Bob pushes Ethics; the server installs its tree and runs unilog check" as bob ipfs pin remote add --service=home "$ETHICS"

story "Carol builds on Bob's: a three-level tree, pushed whole with dpm tree"
C=$W/carol/kant; project carol "$C" Kant; mkdir -p "$C/Kant"
cat > "$C/Kant/Beliefs.ul" <<'EOF'
import Ethics.Core;
# Kant: lying is always wrong.
lying_is_wrong : \X. lies X => wrong X;
lie_to_murderer : lies answering_the_murderer;
wrong_to_lie : wrong answering_the_murderer = lying_is_wrong lie_to_murderer;
EOF
as carol dpm -C "$C" add "$ETHICS"
expect_ok "dpm install pulls Ethics and, through it, Logic" as carol dpm -C "$C" install
[ "$(ls -d "$C"/deps/bafy* | wc -l)" = 2 ] && pass "both packages in deps/" || fail "deps count"
expect_ok "unilog check passes" bash -c "cd '$C' && unilog check"
KANT=$(publish carol "$C"); echo "        Kant v1 = $KANT"
TREE=$(as carol dpm tree "$KANT")
[ "$(wc -l <<<"$TREE")" = 3 ] && pass "dpm tree lists 3 CIDs (Kant, Ethics, Logic)" || fail "dpm tree: $TREE"
expect_ok "push the whole tree: dpm tree | xargs -n1 ipfs pin remote add" \
    as carol bash -c "dpm tree $KANT | xargs -n1 ipfs pin remote add --service=home"

story "Dave pushes a package with a wrong proof: the server refuses it and doesn't keep it"
D=$W/dave/bad; project dave "$D" Bad; mkdir -p "$D/Bad"
cat > "$D/Bad/Claim.ul" <<'EOF'
import Kant.Beliefs;
# Wrong: lying_is_wrong lie_to_murderer proves "wrong answering_the_murderer", not "wrong everything".
everything_is_wrong : \X. wrong X = lying_is_wrong lie_to_murderer;
EOF
as dave dpm -C "$D" add "$KANT"; as dave dpm -C "$D" install >/dev/null
expect_fail "unilog check fails locally" "wrong|does not|cannot|expected|error" bash -c "cd '$D' && unilog check"
BAD=$(publish dave "$D")
expect_fail "the server refuses it" "remote service failed to pin" as dave ipfs pin remote add --service=home "$BAD"
REASON=$(curl -s "http://127.0.0.1:$SRV/pins?cid=$BAD&status=failed" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).results[0]||{}).info?.reason||""))')
[ -n "$REASON" ] && pass "the server recorded why: $(echo "$REASON" | tr '\n' ' ' | cut -c1-110)" || fail "no reason recorded"
sleep 2
expect_fail "the server's Kubo no longer has it (garbage-collected)" "not found|could not find" \
    as server ipfs files stat --offline "/ipfs/$BAD"
expect_ok "the token is required: a wrong one is refused" bash -c \
    "[ \$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer wrong' -H 'Content-Type: application/json' -d '{\"cid\":\"$BAD\"}' http://127.0.0.1:$SRV/pins) = 401 ]"

story "Version propagation: Alice fixes Logic, Bob and Carol bump their dependency; unchanged files are shared"
cat >> "$A/Logic/Prelude.ul" <<'EOF'
snd : \A B. and A B => B;
EOF
expect_ok "unilog check" bash -c "cd '$A' && unilog check"
LOGIC2=$(publish alice "$A"); echo "        Logic v2 = $LOGIC2"
as alice ipfs pin remote add --service=home "$LOGIC2" >/dev/null && pass "Logic v2 pushed" || fail "push Logic v2"
expect_ok "Bob: dpm remove old, dpm add new" as bob bash -c "dpm -C '$B' remove $LOGIC && dpm -C '$B' add $LOGIC2"
expect_ok "Bob: dpm install replaces Logic v1 with v2" as bob dpm -C "$B" install
[ ! -e "$B/deps/$LOGIC" ] && [ -d "$B/deps/$LOGIC2" ] && pass "old version removed from deps/" || fail "stale deps"
expect_ok "unilog check" bash -c "cd '$B' && unilog check"
ETHICS2=$(publish bob "$B"); as bob ipfs pin remote add --service=home "$ETHICS2" >/dev/null && pass "Ethics v2 pushed" || fail "push Ethics v2"
NEW=$(comm -13 <(as bob ipfs refs -r -u "$ETHICS" | sort) <(as bob ipfs refs -r -u "$ETHICS2" | sort) | wc -l)
echo "        Ethics v2 has $NEW blocks that v1 didn't have"
[ "$NEW" -le 2 ] && pass "Ethics v2 shares every unchanged file with v1 (only dpm.json and the folder are new)" || fail "dedup: $NEW new blocks"
as carol bash -c "dpm -C '$C' remove $ETHICS && dpm -C '$C' add $ETHICS2 && dpm -C '$C' install" >/dev/null
expect_ok "Carol: unilog check with the new tree" bash -c "cd '$C' && unilog check"
KANT2=$(publish carol "$C")
expect_ok "Carol pushes Kant v2's tree" as carol bash -c "dpm tree $KANT2 | xargs -n1 ipfs pin remote add --service=home"

story "The authors go offline: everything is still available from the server"
for n in alice bob carol dave; do stop $n; done
R=$W/reader/app; project reader "$R" App; mkdir -p "$R/App"
cat > "$R/App/Main.ul" <<'EOF'
import Kant.Beliefs;
import Logic.Prelude;
# The reader's own conclusion, built on Kant's and Alice's packages.
wrong_and_wrong : and (wrong answering_the_murderer) (wrong answering_the_murderer) = pair wrong_to_lie wrong_to_lie;
EOF
as reader dpm -C "$R" add "$KANT2" "$LOGIC2"
expect_ok "Reader: dpm install of a 3-package tree, only from the server" as reader dpm -C "$R" install
expect_ok "Reader: unilog check of their own project, importing two packages" bash -c "cd '$R' && unilog check"
[ "$(as reader ipfs pin ls --type=recursive | grep -c bafy)" = 0 ] && pass "install pinned nothing" || fail "install pinned something"
expect_ok "Reader keeps what they checked: dpm tree | ipfs pin add (stdin, no xargs)" \
    as reader bash -c "dpm tree $KANT2 | ipfs pin add"
[ "$(as reader ipfs pin ls --type=recursive | grep -cE "$KANT2|$ETHICS2|$LOGIC2")" = 3 ] && pass "all three are pinned" || fail "pins"
expect_ok "dpm ls" as reader dpm -C "$R" ls
as reader dpm -C "$R" ls | sed 's/^/        /'

story "Reader opens Carol's package to work on it: ipfs get, then dpm install"
expect_ok "ipfs get <Kant v2> -o kant-work" as reader ipfs get "$KANT2" -o "$W/reader/kant-work"
expect_ok "dpm install in it" as reader dpm -C "$W/reader/kant-work" install
expect_ok "unilog check passes on the opened package" bash -c "cd '$W/reader/kant-work' && unilog check"

story "Two packages providing the same module: DPM installs both, Unilog reports the clash"
E=$W/eve/logic; project eve "$E" Logic; mkdir -p "$E/Logic"
printf 'false_elim : \\C. false => C;\n' > "$E/Logic/Prelude.ul"
EVE=$(publish eve "$E")
expect_ok "Eve publishes and pushes her own Logic.Prelude" as eve ipfs pin remote add --service=home "$EVE"
X=$W/reader/clash; project reader "$X" App; mkdir -p "$X/App"
printf 'import Logic.Prelude;\nx : \\C. false => C = false_elim;\n' > "$X/App/Main.ul"
as reader dpm -C "$X" add "$LOGIC2" "$EVE"
expect_ok "dpm install installs both" as reader dpm -C "$X" install
expect_fail "unilog check reports the ambiguous module" "ambiguous" bash -c "cd '$X' && unilog check"

story "Removing is refused: what the server keeps, it keeps for good"
expect_fail "Eve tries to remove her package: ipfs pin remote rm" "405|never removes" \
    as eve ipfs pin remote rm --service=home --cid="$EVE" --force
expect_ok "the server's Kubo still has it, pinned" as server ipfs pin ls --type=recursive "$EVE"
RID=$(curl -s "http://127.0.0.1:$SRV/pins?cid=$EVE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).results[0].requestid))')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H 'Authorization: Bearer letmein' "http://127.0.0.1:$SRV/pins/$RID")
[ "$CODE" = 405 ] && pass "removing straight through the server's API, with a valid token, is refused too (405)" || fail "DELETE returned $CODE"

story "Errors users can hit"
expect_fail "dpm add with something that isn't a CID" "Not a CID" as reader dpm -C "$R" add Kant
expect_fail "dpm remove of something that isn't a dependency" "Not a dependency" as reader dpm -C "$R" remove "$EVE"
mkdir -p "$W/reader/nodpm"; echo x > "$W/reader/nodpm/f.ul"
expect_fail "dpm pack without dpm.json" "not a DPM project" as reader dpm -C "$W/reader/nodpm" pack
NOTPKG=$(as reader ipfs add -r -Q "$W/reader/nodpm")
Y=$W/reader/notpkg; project reader "$Y" App; as reader dpm -C "$Y" add "$NOTPKG"
expect_fail "a dependency that isn't a DPM package" "not a DPM package" as reader dpm -C "$Y" install
GONE=$(as reader ipfs add -r -Q --only-hash "$(as reader dpm -C "$Y" pack)")
Z=$W/reader/missing; project reader "$Z" App; as reader dpm -C "$Z" add "$GONE"
expect_fail "a dependency nobody has (dpm install --timeout 5s)" "Could not fetch $GONE" as reader dpm -C "$Z" install --timeout 5s
expect_fail "dpm tree of it prints nothing and fails" "Could not fetch" as reader dpm tree "$GONE" --timeout 5s
expect_fail "dpm with no Kubo reachable" "Cannot reach the IPFS node" as reader env DPM_KUBO_API=http://127.0.0.1:1 dpm tree "$KANT2"

story "Optional: a reader with no Kubo running, reading through a remote Kubo with a read-only token"
kubo_node remote $((P+8)) $((P+108))
IPFS_PATH=$W/kubo/remote ipfs config --json API.Authorizations '{
  "admin": {"AuthSecret":"bearer:admin","AllowedPaths":["/api/v0"]},
  "dpm":   {"AuthSecret":"bearer:read","AllowedPaths":["/api/v0/cat","/api/v0/refs","/api/v0/get","/api/v0/version"]}}'
start remote; sleep 4
IPFS_PATH=$W/kubo/remote ipfs --api-auth=bearer:admin swarm peering add "$PEER" >/dev/null
L=$W/lite/app; mkdir -p "$L"
lite() { IPFS_PATH=$W/lite/no-kubo-here DPM_HOME=$W/home/lite "$@"; }
lite dpm -C "$L" init >/dev/null; (cd "$L" && unilog init --roots . 'deps/*' --check App >/dev/null); mkdir -p "$L/App"
printf 'import Kant.Beliefs;\nmine : wrong answering_the_murderer = wrong_to_lie;\n' > "$L/App/Main.ul"
lite dpm -C "$L" add "$KANT2"
expect_ok "dpm node --set <remote> --auth bearer:<read token>" lite dpm node --set http://127.0.0.1:$((P+8)) --auth bearer:read
expect_ok "dpm install through the remote Kubo" lite dpm -C "$L" install
expect_ok "unilog check" bash -c "cd '$L' && unilog check"
[ ! -e "$W/lite/no-kubo-here" ] && pass "no Kubo repo was ever created on the reader's side" || fail "a local repo appeared"
expect_fail "the read token can't pin" "Access Denied" curl -s --fail-with-body -X POST -H 'Authorization: Bearer read' "http://127.0.0.1:$((P+8))/api/v0/pin/add?arg=$KANT2"

echo; echo "== $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
