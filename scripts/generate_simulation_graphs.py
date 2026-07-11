import json
import sys
from statistics import mean

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np


def safe_mean(values):
    return mean(values) if values else 0


def safe_std(values):
    return float(np.std(values)) if values else 0


def percentile_spread(values):
    if not values:
        return 0

    return float(np.percentile(values, 90) - np.percentile(values, 10))


def build_bins(values, step):
    if not values:
        return np.arange(0, step * 2, step)

    start = int(np.floor(min(values) / step) * step)
    end = int(np.ceil(max(values) / step) * step + step)

    if start == end:
        end += step

    return np.arange(start, end + step, step)


def flatten_simulated_elos(results):
    values = []

    for result in results:
        values.extend(result.get("finalElos", []))

    return [float(value) for value in values]


def build_residuals(current, simulated_average):
    count = min(len(current), len(simulated_average))

    residuals = []

    for index in range(count):
        residuals.append({
            "index": index,
            "official": current[index],
            "simulated": simulated_average[index],
            "delta": simulated_average[index] - current[index],
        })

    return residuals

def plot_residual_leaderboard(axis, current, simulated_average, player_names):
    residuals = build_residuals(current, simulated_average)

    if not residuals:
        axis.axis("off")
        axis.set_title("Model disagreement leaderboard", fontsize=12, fontweight="bold")
        axis.text(0.5, 0.5, "No residual data", ha="center", va="center")
        return

    overperformers = sorted(
        residuals,
        key=lambda item: item["delta"],
        reverse=True,
    )[:20]

    underperformers = sorted(
        residuals,
        key=lambda item: item["delta"],
    )[:20]

    stableperformers = sorted(
        residuals,
        key=lambda item: abs(item["delta"]),
    )[:20]

    axis.axis("off")
    axis.set_title(
        "Model disagreement leaderboard",
        fontsize=12,
        fontweight="bold",
    )

    left_text = ["Top Overperformers", "--------------------"]

    for item in overperformers:
        name = player_names[item["index"]] if item["index"] < len(player_names) else f"Player {item['index'] + 1}"
        left_text.append(f"{name[:16]:16} +{item['delta']:.0f}")

    right_text = ["Top Underperformers", "--------------------"]

    for item in underperformers:
        name = player_names[item["index"]] if item["index"] < len(player_names) else f"Player {item['index'] + 1}"
        right_text.append(f"{name[:16]:16} {item['delta']:.0f}")

    middle_text = ["Most Stable", "--------------------"]
    for item in stableperformers:
        name = player_names[item["index"]] if item["index"] < len(player_names) else f"Player {item['index'] + 1}"
        middle_text.append(f"{name[:16]:16} {item['delta']:.0f}")

    axis.text(
        0.02,
        0.96,
        "\n".join(left_text),
        va="top",
        fontsize=11,
        family="monospace",
    )

    axis.text(
        0.32,
        0.96,
        "\n".join(middle_text),
        va="top",
        fontsize=11,
        family="monospace",
    )

    axis.text(
        0.62,
        0.96,
        "\n".join(right_text),
        va="top",
        fontsize=11,
        family="monospace",
    )

def average_histogram(results, bins):
    if not results:
        return np.zeros(len(bins) - 1)

    histograms = []

    for result in results:
        elos = [float(value) for value in result.get("finalElos", [])]

        if not elos:
            continue

        counts, _ = np.histogram(elos, bins=bins)
        histograms.append(counts)

    if not histograms:
        return np.zeros(len(bins) - 1)

    return np.mean(histograms, axis=0)

def average_metric_by_player(results, key):
    if not results:
        return []

    values_by_index = {}

    for result in results:
        for index, value in enumerate(result.get(key, [])):
            values_by_index.setdefault(index, []).append(float(value))

    averaged = []

    for index in sorted(values_by_index.keys()):
        averaged.append(float(np.mean(values_by_index[index])))

    return averaged


def average_final_elos_by_player(results):
    return average_metric_by_player(results, "finalElos")


def plot_stat_vs_elo_scatter(axis, stat_values, elo_values, stat_label, weight):
    count = min(len(stat_values), len(elo_values))

    if count < 2:
        axis.axis("off")
        axis.set_title(f"{stat_label}/game vs simulated ELO", fontsize=12, fontweight="bold")
        axis.text(0.5, 0.5, "No stat data", ha="center", va="center")
        return

    x = stat_values[:count]
    y = elo_values[:count]

    axis.scatter(x, y, alpha=0.7, s=18)

    correlation = 0

    if float(np.std(x)) > 0:
        correlation = float(np.corrcoef(x, y)[0, 1])

        slope, intercept = np.polyfit(x, y, 1)
        line_x = np.linspace(min(x), max(x), 50)

        axis.plot(
            line_x,
            slope * line_x + intercept,
            linestyle="--",
            linewidth=1.5,
            label="Trend",
        )
        axis.legend(fontsize=8)

    axis.set_title(f"{stat_label}/game vs simulated ELO", fontsize=12, fontweight="bold")
    axis.set_xlabel(f"Avg {stat_label.lower()} per game")
    axis.set_ylabel("Average simulated ELO")

    axis.text(
        0.03,
        0.95,
        f"Corr: {correlation:.2f}\n"
        f"Weight: {weight}",
        transform=axis.transAxes,
        va="top",
        fontsize=9,
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "alpha": 0.88,
            "edgecolor": "#cccccc",
        },
    )

    style_axis(axis)

def plot_current_vs_simulated_scatter(axis, current, simulated_average):
    count = min(len(current), len(simulated_average))

    x = current[:count]
    y = simulated_average[:count]

    axis.scatter(x, y, alpha=0.75)

    min_value = min(x + y)
    max_value = max(x + y)

    axis.plot(
        [min_value, max_value],
        [min_value, max_value],
        linestyle="--",
        linewidth=1.8,
        label="Equal rating line",
    )

    correlation = 0

    if len(x) > 1:
        correlation = float(np.corrcoef(x, y)[0, 1])

    axis.set_title("Current ELO vs Avg simulated ELO", fontsize=12, fontweight="bold")
    axis.set_xlabel("Current official ELO")
    axis.set_ylabel("Average simulated ELO")
    axis.legend()

    axis.text(
        0.03,
        0.95,
        f"Players: {count}\n"
        f"Correlation: {correlation:.2f}",
        transform=axis.transAxes,
        va="top",
        fontsize=9,
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "alpha": 0.88,
            "edgecolor": "#cccccc",
        },
    )

    style_axis(axis)


def style_axis(axis):
    axis.grid(axis="y", alpha=0.25)
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)


def add_stat_box(axis, values):
    avg = safe_mean(values)
    std = safe_std(values)

    axis.text(
        0.03,
        0.95,
        f"Mean: {avg:.0f}\n"
        f"Std Dev: {std:.0f}\n"
        f"P90-P10: {percentile_spread(values):.0f}",
        transform=axis.transAxes,
        va="top",
        fontsize=9,
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "alpha": 0.88,
            "edgecolor": "#cccccc",
        },
    )


def add_std_lines(axis, values):
    avg = safe_mean(values)
    std = safe_std(values)

    if std <= 0:
        return

    axis.axvline(avg, linestyle="-", linewidth=2.2, label="Mean")

    for multiplier in [1, 2, 3]:
        left = avg - std * multiplier
        right = avg + std * multiplier

        axis.axvline(left, linestyle="--", linewidth=1.2, alpha=0.75, color="red")
        axis.axvline(right, linestyle="--", linewidth=1.2, alpha=0.75, color="red")

        ymax = axis.get_ylim()[1]

        axis.text(
            left,
            ymax * 0.97,
            f"-{multiplier}σ",
            rotation=90,
            va="top",
            ha="right",
            fontsize=10,
            alpha=0.75,
        )

        axis.text(
            right,
            ymax * 0.97,
            f"+{multiplier}σ",
            rotation=90,
            va="top",
            ha="left",
            fontsize=10,
            alpha=0.75,
        )


def plot_hist(axis, values, bins, title):
    axis.hist(
        values,
        bins=bins,
        alpha=0.85,
        edgecolor="white",
        linewidth=0.8,
    )

    axis.set_title(title, fontsize=12, fontweight="bold")
    axis.set_xlabel("ELO")
    axis.set_ylabel("Players")

    add_std_lines(axis, values)
    add_stat_box(axis, values)
    style_axis(axis)


def plot_average_sim_distribution(axis, results, bins):
    avg_counts = average_histogram(results, bins)
    centers = (bins[:-1] + bins[1:]) / 2
    width = bins[1] - bins[0]

    axis.bar(
        centers,
        avg_counts,
        width=width * 0.9,
        edgecolor="white",
        linewidth=0.8,
        alpha=0.85,
    )

    flattened = flatten_simulated_elos(results)

    axis.set_title("Average simulated final distribution", fontsize=12, fontweight="bold")
    axis.set_xlabel("ELO")
    axis.set_ylabel("Average players")

    add_std_lines(axis, flattened)
    add_stat_box(axis, flattened)
    style_axis(axis)


def plot_difference(axis, starting, simulated):
    labels = [
        "Mean",
        "Std Dev",
        "P90-P10",
    ]

    start_values = [
        safe_mean(starting),
        safe_std(starting),
        percentile_spread(starting),
    ]

    sim_values = [
        safe_mean(simulated),
        safe_std(simulated),
        percentile_spread(simulated),
    ]

    x = np.arange(len(labels))
    width = 0.36

    axis.bar(x - width / 2, start_values, width, label="Current")
    axis.bar(x + width / 2, sim_values, width, label="Simulated avg")

    axis.set_title("Distribution metric comparison", fontsize=12, fontweight="bold")
    axis.set_xticks(x)
    axis.set_xticklabels(labels)
    axis.set_ylabel("ELO")
    axis.legend()

    style_axis(axis)


def plot_stddev_distribution(axis, results, starting_std):
    stddevs = [float(result.get("finalStdDev", 0)) for result in results]

    axis.hist(
        stddevs,
        bins=10,
        alpha=0.85,
        edgecolor="white",
        linewidth=0.8,
    )

    sim_mean = safe_mean(stddevs)

    axis.axvline(starting_std, linewidth=2, label="Current")
    axis.axvline(sim_mean, linestyle="--", linewidth=2, label="Sim mean")

    axis.set_title("Final Std Dev across simulations", fontsize=12, fontweight="bold")
    axis.set_xlabel("Std Dev")
    axis.set_ylabel("Simulations")
    axis.legend()

    axis.text(
        0.03,
        0.95,
        f"Current: {starting_std:.0f}\n"
        f"Sim mean: {sim_mean:.0f}\n"
        f"Sim max: {max(stddevs) if stddevs else 0:.0f}",
        transform=axis.transAxes,
        va="top",
        fontsize=9,
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "alpha": 0.88,
            "edgecolor": "#cccccc",
        },
    )

    style_axis(axis)


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: generate_simulation_graphs.py <input_json> <output_png>")

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, "r", encoding="utf-8") as file:
        data = json.load(file)

    player_names = data.get("playerNames", [])
    current = [float(value) for value in data.get("currentElos", [])]
    starting = [float(value) for value in data.get("startingElos", [])]
    results = data.get("simulationResults", [])
    simulated = flatten_simulated_elos(results)
    simulated_average_by_player = average_final_elos_by_player(results)

    if not current or not starting or not simulated:
        raise SystemExit("No usable simulation data found.")

    bins = build_bins(current + starting + simulated, 25)
    starting_std = safe_std(starting)

    setup = data.get("setup", {})
    model = data.get("model", {})

    plt.rcParams.update({
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 10,
        "figure.titlesize": 16,
    })

    fig = plt.figure(figsize=(16, 16))
    fig.patch.set_facecolor("#f5f5f5")

    grid = fig.add_gridspec(3, 6)

    plot_hist(
        fig.add_subplot(grid[0, :3]),
        current,
        bins,
        "Current official ELO distribution",
    )

    plot_average_sim_distribution(
        fig.add_subplot(grid[0, 3:]),
        results,
        bins,
    )

    plot_residual_leaderboard(
        fig.add_subplot(grid[1, :3]),
        current,
        simulated_average_by_player,
        player_names,
    )

    plot_current_vs_simulated_scatter(
        fig.add_subplot(grid[1, 3:]),
        current,
        simulated_average_by_player,
    )

    avg_goals_by_player = average_metric_by_player(results, "finalAvgGoals")
    avg_assists_by_player = average_metric_by_player(results, "finalAvgAssists")
    avg_saves_by_player = average_metric_by_player(results, "finalAvgSaves")

    plot_stat_vs_elo_scatter(
        fig.add_subplot(grid[2, :2]),
        avg_goals_by_player,
        simulated_average_by_player,
        "Goals",
        model.get("goalWeight"),
    )

    plot_stat_vs_elo_scatter(
        fig.add_subplot(grid[2, 2:4]),
        avg_assists_by_player,
        simulated_average_by_player,
        "Assists",
        model.get("assistWeight"),
    )

    plot_stat_vs_elo_scatter(
        fig.add_subplot(grid[2, 4:]),
        avg_saves_by_player,
        simulated_average_by_player,
        "Saves",
        model.get("saveWeight"),
    )

    fig.suptitle(
        "Current vs Simulated ELO Distribution",
        fontsize=17,
        fontweight="bold",
    )

    summary = (
        f"Players={setup.get('eligiblePlayers')} | "
        f"Matches/sim={setup.get('simulatedMatches')} | "
        f"Simulations={setup.get('simulations')} | "
        f"Randomness={setup.get('randomness')}"
    )

    settings = (
        f"Goal={model.get('goalWeight')} | "
        f"Assist={model.get('assistWeight')} | "
        f"Save={model.get('saveWeight')} | "
        f"Guaranteed={model.get('guaranteedPercent')}% | "
        f"K={model.get('kFactor')} | "
        f"Scale={model.get('expectedScale')} | "
        f"PerfScale={model.get('performanceScale')}"
    )

    fig.text(
        0.5,
        0.045,
        summary,
        ha="center",
        fontsize=11,
        fontweight="bold",
        bbox={
            "boxstyle": "round,pad=0.45",
            "facecolor": "white",
            "alpha": 0.9,
            "edgecolor": "#cccccc",
        },
    )

    fig.text(
        0.5,
        0.015,
        settings,
        ha="center",
        fontsize=9,
        bbox={
            "boxstyle": "round,pad=0.35",
            "facecolor": "white",
            "alpha": 0.9,
            "edgecolor": "#cccccc",
        },
    )

    plt.tight_layout(rect=[0, 0.08, 1, 0.94])
    plt.savefig(output_path, dpi=180)
    plt.close(fig)


if __name__ == "__main__":
    main()