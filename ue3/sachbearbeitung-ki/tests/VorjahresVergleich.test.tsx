import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VorjahresVergleich } from "../src/components/VorjahresVergleich";

const hookMock = vi.hoisted(() => ({
  state: {
    data: null as unknown,
    loading: false,
    error: null as string | null,
  },
}));

vi.mock("../src/hooks/useVergleichVorjahr", () => ({
  useVergleichVorjahr: () => ({ ...hookMock.state, reload: vi.fn() }),
}));

describe("VorjahresVergleich", () => {
  it("rendert nichts (null), wenn data=null und kein Fehler — der Fall 'noch lädt nicht'", () => {
    hookMock.state.data = null;
    hookMock.state.loading = false;
    hookMock.state.error = null;
    const { container } = render(<VorjahresVergleich antragId="a-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("zeigt 'Lade …' während loading=true", () => {
    hookMock.state.data = null;
    hookMock.state.loading = true;
    hookMock.state.error = null;
    render(<VorjahresVergleich antragId="a-1" />);
    expect(screen.getByText(/Lade/)).toBeInTheDocument();
  });

  it("zeigt 'kein Antrag des gleichen Trägers' bei vorjahr=null", () => {
    hookMock.state.data = {
      vorjahr: null,
      gesucht_hj: 2025,
      aenderungen: [],
    };
    hookMock.state.loading = false;
    hookMock.state.error = null;
    render(<VorjahresVergleich antragId="a-1" />);
    expect(screen.getByText(/Kein Antrag des gleichen Trägers/)).toBeInTheDocument();
  });
});
