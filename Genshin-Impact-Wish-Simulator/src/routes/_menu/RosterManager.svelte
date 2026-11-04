<script>
	import { t } from 'svelte-i18n';

	import { memberList } from '$lib/store/app-stores';
	import {
		RARITIES,
		RARITY_WEIGHT,
		addMember,
		groupByRarity,
		isWeightedEnabled,
		removeMember,
		setAllRarity,
		setMemberRarity,
		setWeightedEnabled
	} from '$lib/helpers/roster';
	import { playSfx } from '$lib/helpers/audio/audio';
	import { pushToast } from '$lib/helpers/toast';

	let newName = '';
	let newRarity = 3;
	let weighted = isWeightedEnabled();

	$: members = $memberList || [];
	$: grouped = groupByRarity(members);

	const starLabel = (rarity) => `${rarity}★`;

	const handleRarity = (key, rarity) => {
		playSfx();
		setMemberRarity(key, rarity);
	};

	const handleRemove = (key) => {
		playSfx('close');
		removeMember(key);
	};

	const handleAdd = () => {
		const name = newName.trim();
		if (!name) return;
		playSfx();
		addMember(name, newRarity);
		newName = '';
	};

	const handleSetAll = (rarity) => {
		playSfx();
		setAllRarity(rarity);
		pushToast({ message: $t('menu.rosterManage.saved'), type: 'success' });
	};

	const handleWeighted = (event) => {
		const checked = event.target.checked;
		playSfx();
		weighted = setWeightedEnabled(checked);
	};

	/** 把名单按星级分组展示，5★ 在最上面 */
	const groupedEntries = () =>
		RARITIES.map((rarity) => ({
			rarity,
			items: grouped[rarity] || []
		})).filter((group) => group.items.length > 0);
</script>

<div class="roster">
	<div class="summary">
		<span>{$t('menu.rosterManage.count', { values: { count: members.length } })}</span>
		<span class="dist">
			{#each RARITIES as rarity}
				{#if grouped[rarity]?.length}
					<i class="star s{rarity}">{starLabel(rarity)}</i>
					{grouped[rarity].length}
				{/if}
			{/each}
		</span>
	</div>

	{#if !members.length}
		<div class="empty">
			{$t('menu.rosterManage.empty')}
		</div>
	{:else}
		<div class="actions">
			<button class="act" on:click={() => handleSetAll(5)}>
				{$t('menu.rosterManage.setAll', { values: { rarity: 5 } })}
			</button>
			<button class="act" on:click={() => handleSetAll(4)}>
				{$t('menu.rosterManage.setAll', { values: { rarity: 4 } })}
			</button>
			<button class="act" on:click={() => handleSetAll(3)}>
				{$t('menu.rosterManage.setAll', { values: { rarity: 3 } })}
			</button>
		</div>

		<div class="list">
			{#each groupedEntries() as group (group.rarity)}
				{#each group.items as member (member.name)}
					<div class="row">
						<span class="name" title={member.chineseChar}>{member.chineseChar}</span>

						<div class="stars">
							{#each RARITIES as rarity}
								<button
									class="star s{rarity}"
									class:active={member.rarity === rarity}
									title={$t('menu.rosterManage.setRarity', { values: { rarity } })}
									on:click={() => handleRarity(member.name, rarity)}
								>
									{starLabel(rarity)}
								</button>
							{/each}
						</div>

						<button class="del" title={$t('menu.rosterManage.delete')} on:click={() => handleRemove(member.name)}>
							<i class="gi-delete" />
						</button>
					</div>
				{/each}
			{/each}
		</div>
	{/if}

	<div class="add">
		<input
			type="text"
			placeholder={$t('menu.rosterManage.addPlaceholder')}
			bind:value={newName}
			on:keydown={(e) => e.key === 'Enter' && handleAdd()}
		/>
		<div class="stars">
			{#each RARITIES as rarity}
				<button
					class="star s{rarity}"
					class:active={newRarity === rarity}
					on:click={() => (newRarity = rarity)}
				>
					{starLabel(rarity)}
				</button>
			{/each}
		</div>
		<button class="act add-btn" disabled={!newName.trim()} on:click={handleAdd}>
			{$t('menu.rosterManage.add')}
		</button>
	</div>

	<label class="weighted">
		<input type="checkbox" checked={weighted} on:change={handleWeighted} />
		<span>
			{$t('menu.rosterManage.weighted')}
			<small>
				{$t('menu.rosterManage.weightedDesc', {
					values: {
						five: RARITY_WEIGHT[5],
						four: RARITY_WEIGHT[4],
						three: RARITY_WEIGHT[3]
					}
				})}
			</small>
		</span>
	</label>
</div>

<style>
	.roster {
		font-size: 0.85rem;
		padding-bottom: 2rem;
	}

	.summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.2rem;
		color: var(--tertiary-color);
	}

	.dist {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}

	.star {
		font-style: normal;
		opacity: 0.35;
		transition: all 0.15s;
		cursor: pointer;
	}
	.star.active,
	.star:hover {
		opacity: 1;
	}
	.s5 {
		color: #e8b45a;
	}
	.s4 {
		color: #b98ce0;
	}
	.s3 {
		color: #8bb8e8;
	}

	.empty {
		background-color: rgba(255, 255, 255, 0.7);
		border-radius: 0.5rem;
		padding: 1.2rem 1rem;
		color: #6b6558;
		line-height: 1.7;
		margin: 0.5rem 0;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}

	.act {
		background-color: #dcd4c2;
		border: none;
		border-radius: 1rem;
		padding: 0.35rem 0.8rem;
		font-size: 0.75rem;
		color: #4a4536;
		cursor: pointer;
		transition: all 0.2s;
	}
	.act:hover {
		background-color: #efe9dc;
	}
	.act:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.list {
		max-height: 42vh;
		overflow-y: auto;
		background-color: rgba(255, 255, 255, 0.55);
		border-radius: 0.5rem;
		padding: 0.3rem 0.5rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0;
		border-bottom: 1px dashed rgba(120, 110, 90, 0.25);
	}
	.row:last-child {
		border-bottom: none;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #3d3a2e;
	}

	.stars {
		display: inline-flex;
		gap: 0.15rem;
		font-size: 0.7rem;
	}

	.del {
		background: none;
		border: none;
		cursor: pointer;
		color: #9a9382;
		padding: 0 0.2rem;
		font-size: 0.9rem;
	}
	.del:hover {
		color: #c0563f;
	}

	.add {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.8rem;
	}
	.add input[type='text'] {
		flex: 1;
		min-width: 0;
		border: 1px solid #c9c0ab;
		background-color: #fff;
		border-radius: 0.3rem;
		padding: 0.4rem 0.6rem;
		font-size: 0.8rem;
	}
	.add-btn {
		white-space: nowrap;
	}

	.weighted {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-top: 1rem;
		color: #4a4536;
		line-height: 1.5;
	}
	.weighted small {
		display: block;
		color: #8a8578;
		font-size: 0.72rem;
	}
</style>