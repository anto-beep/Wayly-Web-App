import { Link } from "react-router-dom";

// HCP-BRIDGE-1: short bridge line that captures old-name "Home Care Package"
// searchers and links them to the pillar page. Exact approved copy.
export default function HcpBridgeLine({ className = "" }) {
    return (
        <p
            data-testid="hcp-bridge-line"
            className={`text-sm text-primary-k/85 bg-surface-2 border border-kindred rounded-lg px-3.5 py-2.5 leading-relaxed ${className}`}
        >
            Support at Home replaced{" "}
            <Link to="/home-care-packages" className="text-[#A5512B] font-semibold underline underline-offset-2">
                Home Care Packages
            </Link>{" "}
            on 01/11/2025. If you had a Home Care Package, this is you.
        </p>
    );
}
