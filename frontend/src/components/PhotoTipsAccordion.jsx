import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function PhotoTipsAccordion() {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-3 border border-kindred rounded-lg overflow-hidden bg-surface-2" data-testid="photo-tips-accordion">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-surface"
                data-testid="photo-tips-toggle"
            >
                <span className="text-sm font-medium text-primary-k">Tips for photographing a paper statement</span>
                <ChevronDown className={`h-4 w-4 text-muted-k transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="px-4 py-3 bg-surface text-sm text-muted-k space-y-2">
                    <p className="text-primary-k">For the most accurate results when photographing a paper statement:</p>
                    <ul className="space-y-1 list-none pl-0">
                        <li>✓ Lay the statement flat on a table or desk</li>
                        <li>✓ Use good lighting — natural light or bright overhead room light works well</li>
                        <li>✓ Hold your phone directly above the statement, not at an angle</li>
                        <li>✓ Make sure all four edges of the paper are visible</li>
                        <li>✓ Photograph one page at a time if multi-page</li>
                        <li>✓ Avoid shadows across the text</li>
                        <li>✓ Tap the screen to focus before taking the photo</li>
                    </ul>
                    <p className="border-t border-kindred pt-2">
                        Multi-page paper statement? Combine pages into a single PDF using your phone's Files app (iPhone) or Google Drive scan feature (Android), and upload the PDF.
                    </p>
                </div>
            )}
        </div>
    );
}
