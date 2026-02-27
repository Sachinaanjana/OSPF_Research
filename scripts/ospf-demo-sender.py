#!/usr/bin/env python3
"""
OSPF Real-Time Demo Sender
===========================
Sends randomized OSPF LSA data to the topology visualizer API every N seconds.
Each push randomly:
  - Adds a new router
  - Removes a router
  - Changes a link metric
  - Adds a new link between existing routers
  - Restores a previously removed router

Usage:
  python ospf-demo-sender.py --url https://v0-network-automation-visualization.vercel.app --interval 15

Requirements:
  pip install requests
"""

import argparse
import copy
import json
import random
import time
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# BASE TOPOLOGY -- matches your sample data
# ---------------------------------------------------------------------------

BASE_ROUTERS = {
    "1.1.1.1": {
        "role": "ABR",
        "areas": ["0", "1"],
        "seq": "80000005",
        "checksum": "0x3A9C",
    },
    "2.2.2.2": {
        "role": "ABR+ASBR",
        "areas": ["0"],
        "seq": "80000007",
        "checksum": "0x4B2E",
    },
    "3.3.3.3": {
        "role": "ABR",
        "areas": ["0", "2"],
        "seq": "80000003",
        "checksum": "0x5D1F",
    },
    "4.4.4.4": {
        "role": "internal",
        "areas": ["1"],
        "seq": "80000006",
        "checksum": "0x6E3A",
    },
    "5.5.5.5": {
        "role": "internal",
        "areas": ["2"],
        "seq": "80000008",
        "checksum": "0x8D1C",
    },
}

# Each link: (router_a, router_b, iface_a, iface_b, subnet, mask, metric, area, link_type)
BASE_LINKS = [
    ("1.1.1.1", "2.2.2.2", "10.0.12.1", "10.0.12.2", "10.0.12.0", "255.255.255.252", 10, "0", "point-to-point"),
    ("2.2.2.2", "3.3.3.3", "10.0.23.1", "10.0.23.2", "10.0.23.0", "255.255.255.252", 20, "0", "point-to-point"),
    ("1.1.1.1", "4.4.4.4", "10.1.14.1", "10.1.14.2", "10.1.14.0", "255.255.255.252", 15, "1", "point-to-point"),
    ("3.3.3.3", "5.5.5.5", "10.2.35.1", "10.2.35.2", "10.2.35.0", "255.255.255.252", 25, "2", "point-to-point"),
]

# Transit network in Area 0
TRANSIT_NET = {
    "dr": "10.0.123.2",
    "advertising": "2.2.2.2",
    "mask": "/24",
    "attached": ["1.1.1.1", "2.2.2.2", "3.3.3.3"],
    "area": "0",
    "members_iface": {
        "1.1.1.1": "10.0.123.1",
        "2.2.2.2": "10.0.123.2",
        "3.3.3.3": "10.0.123.3",
    },
    "metric": 5,
}

# Stub networks
STUBS = {
    "4.4.4.4": [("10.1.40.0", "255.255.255.0", 1)],
    "5.5.5.5": [("10.2.50.0", "255.255.255.0", 1)],
}

# Extra routers that can be randomly added
EXTRA_ROUTERS = {
    "6.6.6.6": {
        "role": "internal",
        "area": "1",
        "connect_to": "4.4.4.4",
        "iface_self": "10.1.46.2",
        "iface_peer": "10.1.46.1",
        "subnet": "10.1.46.0",
        "mask": "255.255.255.252",
        "metric": 10,
        "stubs": [("10.1.60.0", "255.255.255.0", 1)],
    },
    "7.7.7.7": {
        "role": "internal",
        "area": "2",
        "connect_to": "5.5.5.5",
        "iface_self": "10.2.57.2",
        "iface_peer": "10.2.57.1",
        "subnet": "10.2.57.0",
        "mask": "255.255.255.252",
        "metric": 15,
        "stubs": [("10.2.70.0", "255.255.255.0", 1)],
    },
    "8.8.8.8": {
        "role": "internal",
        "area": "0",
        "connect_to": "2.2.2.2",
        "iface_self": "10.0.28.2",
        "iface_peer": "10.0.28.1",
        "subnet": "10.0.28.0",
        "mask": "255.255.255.252",
        "metric": 30,
        "stubs": [("10.0.80.0", "255.255.255.0", 1)],
    },
}


# ---------------------------------------------------------------------------
# OSPF OUTPUT GENERATOR
# ---------------------------------------------------------------------------

class TopologyState:
    def __init__(self):
        self.routers = copy.deepcopy(BASE_ROUTERS)
        self.links = copy.deepcopy(BASE_LINKS)
        self.transit_net = copy.deepcopy(TRANSIT_NET)
        self.stubs = copy.deepcopy(STUBS)
        self.added_extras = {}  # router_id -> EXTRA_ROUTERS entry
        self.metric_overrides = {}  # (a, b) -> new_metric
        self.seq_counter = 10

    def _next_seq(self):
        self.seq_counter += 1
        return f"8000{self.seq_counter:04X}"

    def _rand_age(self):
        return random.randint(50, 800)

    def _rand_checksum(self):
        return f"0x{random.randint(0x1000, 0xFFFF):04X}"

    # ------ mutation actions ------

    def add_random_router(self):
        available = [r for r in EXTRA_ROUTERS if r not in self.routers]
        if not available:
            return None
        rid = random.choice(available)
        info = EXTRA_ROUTERS[rid]
        self.routers[rid] = {
            "role": info["role"],
            "areas": [info["area"]],
            "seq": self._next_seq(),
            "checksum": self._rand_checksum(),
        }
        self.links.append((
            info["connect_to"], rid,
            info["iface_peer"], info["iface_self"],
            info["subnet"], info["mask"],
            info["metric"], info["area"], "point-to-point"
        ))
        self.stubs[rid] = info["stubs"]
        self.added_extras[rid] = info
        return f"Router {rid} joined (Area {info['area']})"

    def remove_random_router(self):
        removable = [r for r in self.added_extras if r in self.routers]
        if not removable:
            # Can also remove a non-core router
            removable = [r for r in self.routers if r not in ("1.1.1.1", "2.2.2.2", "3.3.3.3")]
        if not removable:
            return None
        rid = random.choice(removable)
        del self.routers[rid]
        self.links = [l for l in self.links if l[0] != rid and l[1] != rid]
        self.stubs.pop(rid, None)
        self.added_extras.pop(rid, None)
        # Remove from transit network if present
        if rid in self.transit_net["attached"]:
            self.transit_net["attached"].remove(rid)
            self.transit_net["members_iface"].pop(rid, None)
        return f"Router {rid} went DOWN"

    def change_random_metric(self):
        if not self.links:
            return None
        idx = random.randint(0, len(self.links) - 1)
        link = list(self.links[idx])
        old_metric = link[6]
        new_metric = random.choice([m for m in [5, 10, 15, 20, 30, 50, 100] if m != old_metric])
        link[6] = new_metric
        self.links[idx] = tuple(link)
        return f"Metric {link[0]}<->{link[1]}: {old_metric} -> {new_metric}"

    def restore_random_router(self):
        missing = [r for r in BASE_ROUTERS if r not in self.routers]
        if not missing:
            return None
        rid = random.choice(missing)
        self.routers[rid] = copy.deepcopy(BASE_ROUTERS[rid])
        self.routers[rid]["seq"] = self._next_seq()
        # Restore original links
        for bl in BASE_LINKS:
            if (bl[0] == rid or bl[1] == rid):
                other = bl[1] if bl[0] == rid else bl[0]
                if other in self.routers:
                    already = any((l[0] == bl[0] and l[1] == bl[1]) or (l[0] == bl[1] and l[1] == bl[0]) for l in self.links)
                    if not already:
                        self.links.append(bl)
        if rid in STUBS:
            self.stubs[rid] = copy.deepcopy(STUBS[rid])
        # Restore transit membership
        if rid in TRANSIT_NET["members_iface"] and rid not in self.transit_net["attached"]:
            self.transit_net["attached"].append(rid)
            self.transit_net["members_iface"][rid] = TRANSIT_NET["members_iface"][rid]
        return f"Router {rid} restored (back online)"

    # ------ generate OSPF output ------

    def generate_ospf_output(self):
        lines = [f'OSPF Router with ID (1.1.1.1) (Process ID 1)', '']
        areas = sorted(set(a for r in self.routers.values() for a in r["areas"]))

        for area in areas:
            lines.append(f'                Router Link States (Area {area})')
            lines.append('')

            # Routers in this area
            for rid, rinfo in sorted(self.routers.items()):
                if area not in rinfo["areas"]:
                    continue

                # Gather links for this router in this area
                router_links = []
                for link in self.links:
                    a_id, b_id, a_iface, b_iface, subnet, mask, metric, link_area, ltype = link
                    if link_area != area:
                        continue
                    if a_id == rid:
                        router_links.append((b_id, a_iface, subnet, mask, metric, ltype))
                    elif b_id == rid:
                        router_links.append((a_id, b_iface, subnet, mask, metric, ltype))

                # Transit network membership
                transit_links = []
                if area == self.transit_net["area"] and rid in self.transit_net["attached"]:
                    iface = self.transit_net["members_iface"].get(rid, "0.0.0.0")
                    transit_links.append((self.transit_net["dr"], iface, self.transit_net["metric"]))

                # Stub networks
                stub_links = self.stubs.get(rid, [])

                num_links = len(router_links) * 2 + len(transit_links) + len(stub_links)
                # point-to-point links count as 2 (p2p + stub)

                lines.append(f'  LS age: {self._rand_age()}')
                lines.append(f'  Options: (No TOS-capability, DC)')
                lines.append(f'  LS Type: Router Links')
                lines.append(f'  Link State ID: {rid}')
                lines.append(f'  Advertising Router: {rid}')
                lines.append(f'  LS Seq Number: {rinfo["seq"]}')
                lines.append(f'  Checksum: {rinfo["checksum"]}')
                lines.append(f'  Length: {24 + num_links * 12}')

                role = rinfo["role"]
                if "ABR" in role:
                    lines.append(f'  Area Border Router')
                if "ASBR" in role:
                    lines.append(f'  AS Boundary Router')

                total = len(router_links) + len(transit_links) + len(stub_links)
                # Each p2p link also has a stub for its subnet, but we list them as separate entries
                num_entries = 0
                for _ in router_links:
                    num_entries += 2  # p2p + stub
                num_entries += len(transit_links)
                num_entries += len(stub_links)

                lines.append(f'   Number of Links: {num_entries}')
                lines.append('')

                for neighbor, iface, subnet, mask, metric, ltype in router_links:
                    lines.append(f'    Link connected to: another Router (point-to-point)')
                    lines.append(f'     (Link ID) Neighboring Router ID: {neighbor}')
                    lines.append(f'     (Link Data) Router Interface address: {iface}')
                    lines.append(f'     Number of Metrics: 0')
                    lines.append(f'      TOS 0 Metrics: {metric}')
                    lines.append('')
                    lines.append(f'    Link connected to: a Stub Network')
                    lines.append(f'     (Link ID) Network/subnet number: {subnet}')
                    lines.append(f'     (Link Data) Network Mask: {mask}')
                    lines.append(f'     Number of Metrics: 0')
                    lines.append(f'      TOS 0 Metrics: {metric}')
                    lines.append('')

                for dr, iface, metric in transit_links:
                    lines.append(f'    Link connected to: a Transit Network')
                    lines.append(f'     (Link ID) Designated Router address: {dr}')
                    lines.append(f'     (Link Data) Router Interface address: {iface}')
                    lines.append(f'     Number of Metrics: 0')
                    lines.append(f'      TOS 0 Metrics: {metric}')
                    lines.append('')

                for snet, smask, smetric in stub_links:
                    lines.append(f'    Link connected to: a Stub Network')
                    lines.append(f'     (Link ID) Network/subnet number: {snet}')
                    lines.append(f'     (Link Data) Network Mask: {smask}')
                    lines.append(f'     Number of Metrics: 0')
                    lines.append(f'      TOS 0 Metrics: {smetric}')
                    lines.append('')

        # Net Link States (Area 0) -- transit network
        if len(self.transit_net["attached"]) >= 2:
            lines.append(f'                Net Link States (Area {self.transit_net["area"]})')
            lines.append('')
            lines.append(f'  LS age: {self._rand_age()}')
            lines.append(f'  Options: (No TOS-capability, DC)')
            lines.append(f'  LS Type: Network Links')
            lines.append(f'  Link State ID: {self.transit_net["dr"]}')
            lines.append(f'  Advertising Router: {self.transit_net["advertising"]}')
            lines.append(f'  LS Seq Number: {self._next_seq()}')
            lines.append(f'  Checksum: {self._rand_checksum()}')
            lines.append(f'  Length: {20 + len(self.transit_net["attached"]) * 4}')
            lines.append(f'  Network Mask: {self.transit_net["mask"]}')
            for att in sorted(self.transit_net["attached"]):
                lines.append(f'        Attached Router: {att}')
            lines.append('')

        # Summary Net Link States (Area 0)
        lines.append(f'                Summary Net Link States (Area 0)')
        lines.append('')
        if any(a == "1" for r in self.routers.values() for a in r["areas"]):
            lines.append(f'  LS age: {self._rand_age()}')
            lines.append(f'  Options: (No TOS-capability, DC)')
            lines.append(f'  LS Type: Summary Links(Network)')
            lines.append(f'  Link State ID: 10.1.0.0')
            lines.append(f'  Advertising Router: 1.1.1.1')
            lines.append(f'  LS Seq Number: {self._next_seq()}')
            lines.append(f'  Checksum: {self._rand_checksum()}')
            lines.append(f'  Length: 28')
            lines.append(f'  Network Mask: /16')
            lines.append(f'        TOS: 0  Metric: 15')
            lines.append('')

        if any(a == "2" for r in self.routers.values() for a in r["areas"]):
            lines.append(f'  LS age: {self._rand_age()}')
            lines.append(f'  Options: (No TOS-capability, DC)')
            lines.append(f'  LS Type: Summary Links(Network)')
            lines.append(f'  Link State ID: 10.2.0.0')
            lines.append(f'  Advertising Router: 3.3.3.3')
            lines.append(f'  LS Seq Number: {self._next_seq()}')
            lines.append(f'  Checksum: {self._rand_checksum()}')
            lines.append(f'  Length: 28')
            lines.append(f'  Network Mask: /16')
            lines.append(f'        TOS: 0  Metric: 25')
            lines.append('')

        return '\n'.join(lines)


# ---------------------------------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------------------------------

def send_ospf_data(url: str, data: str) -> bool:
    """POST raw OSPF text to the API endpoint."""
    api_url = url.rstrip("/") + "/api/ospf-poll"
    encoded = data.encode("utf-8")
    req = urllib.request.Request(
        api_url,
        data=encoded,
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode())
            print(f"  -> POST {resp.status} | size={body.get('size', '?')} bytes")
            return True
    except urllib.error.HTTPError as e:
        print(f"  -> HTTP Error {e.code}: {e.read().decode()[:200]}")
        return False
    except Exception as e:
        print(f"  -> Error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="OSPF Real-Time Demo Sender")
    parser.add_argument(
        "--url",
        default="https://v0-network-automation-visualization.vercel.app",
        help="Base URL of the topology visualizer",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=15,
        help="Seconds between pushes (default: 15)",
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=0,
        help="Number of rounds to send (0 = infinite)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  OSPF Real-Time Demo Sender")
    print("=" * 60)
    print(f"  Target : {args.url}")
    print(f"  Interval : {args.interval}s")
    print(f"  Rounds : {'infinite' if args.rounds == 0 else args.rounds}")
    print("=" * 60)
    print()

    state = TopologyState()
    round_num = 0

    # First push: baseline topology
    print(f"[Round 0] Sending baseline topology ({len(state.routers)} routers, {len(state.links)} links)")
    ospf_text = state.generate_ospf_output()
    send_ospf_data(args.url, ospf_text)

    try:
        while True:
            time.sleep(args.interval)
            round_num += 1

            if args.rounds > 0 and round_num > args.rounds:
                print("\nAll rounds complete.")
                break

            # Pick a random action with weighted probabilities
            actions = []
            actions.append(("add_router", 30))
            actions.append(("remove_router", 20))
            actions.append(("change_metric", 35))
            actions.append(("restore_router", 15))

            # Weighted random choice
            total_weight = sum(w for _, w in actions)
            r = random.randint(1, total_weight)
            cumulative = 0
            chosen_action = "change_metric"
            for action, weight in actions:
                cumulative += weight
                if r <= cumulative:
                    chosen_action = action
                    break

            # Execute mutation
            result = None
            if chosen_action == "add_router":
                result = state.add_random_router()
            elif chosen_action == "remove_router":
                result = state.remove_random_router()
            elif chosen_action == "change_metric":
                result = state.change_random_metric()
            elif chosen_action == "restore_router":
                result = state.restore_random_router()

            if result is None:
                # Fallback: change a metric
                result = state.change_random_metric()

            if result is None:
                print(f"[Round {round_num}] No changes possible, sending same topology")
            else:
                print(f"[Round {round_num}] {result}")

            print(f"  Topology: {len(state.routers)} routers, {len(state.links)} links")
            ospf_text = state.generate_ospf_output()
            send_ospf_data(args.url, ospf_text)

    except KeyboardInterrupt:
        print("\n\nStopped by user. Bye!")


if __name__ == "__main__":
    main()
