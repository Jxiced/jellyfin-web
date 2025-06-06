import type { AccessSchedule, ParentalRating, UserDto } from '@jellyfin/sdk/lib/generated-client';
import { UnratedItem } from '@jellyfin/sdk/lib/generated-client/models/unrated-item';
import { DynamicDayOfWeek } from '@jellyfin/sdk/lib/generated-client/models/dynamic-day-of-week';
import escapeHTML from 'escape-html';
import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import globalize from '../../../../lib/globalize';
import AccessScheduleList from '../../../../components/dashboard/users/AccessScheduleList';
import TagList from '../../../../components/dashboard/users/TagList';
import Button from '../../../../elements/emby-button/Button';
import SectionTitleContainer from '../../../../elements/SectionTitleContainer';
import SectionTabs from '../../../../components/dashboard/users/SectionTabs';
import loading from '../../../../components/loading/loading';
import toast from '../../../../components/toast/toast';
import CheckBoxElement from '../../../../elements/CheckBoxElement';
import SelectElement from '../../../../elements/SelectElement';
import Page from '../../../../components/Page';
import prompt from '../../../../components/prompt/prompt';
import ServerConnections from 'components/ServerConnections';

type NamedItem = {
    name: string;
    value: UnratedItem;
};

type UnratedNamedItem = NamedItem & {
    checkedAttribute: string
};

function handleSaveUser(
    page: HTMLDivElement,
    getSchedulesFromPage: () => AccessSchedule[],
    getAllowedTagsFromPage: () => string[],
    getBlockedTagsFromPage: () => string[],
    onSaveComplete: () => void
) {
    return (user: UserDto) => {
        const userId = user.Id;
        const userPolicy = user.Policy;
        if (!userId || !userPolicy) {
            throw new Error('Unexpected null user id or policy');
        }

        const parentalRating = parseInt((page.querySelector('#selectMaxParentalRating') as HTMLSelectElement).value, 10);
        userPolicy.MaxParentalRating = Number.isNaN(parentalRating) ? null : parentalRating;
        userPolicy.BlockUnratedItems = Array.prototype.filter
            .call(page.querySelectorAll('.chkUnratedItem'), i => i.checked)
            .map(i => i.getAttribute('data-itemtype'));
        userPolicy.AccessSchedules = getSchedulesFromPage();
        userPolicy.AllowedTags = getAllowedTagsFromPage();
        userPolicy.BlockedTags = getBlockedTagsFromPage();
        ServerConnections.getCurrentApiClientAsync()
            .then(apiClient => apiClient.updateUserPolicy(userId, userPolicy))
            .then(() => onSaveComplete())
            .catch(err => {
                console.error('[userparentalcontrol] failed to update user policy', err);
            });
    };
}

const UserParentalControl = () => {
    const [ searchParams ] = useSearchParams();
    const userId = searchParams.get('userId');
    const [ userName, setUserName ] = useState('');
    const [ parentalRatings, setParentalRatings ] = useState<ParentalRating[]>([]);
    const [ unratedItems, setUnratedItems ] = useState<UnratedNamedItem[]>([]);
    const [ maxParentalRating, setMaxParentalRating ] = useState<string>();
    const [ accessSchedules, setAccessSchedules ] = useState<AccessSchedule[]>([]);
    const [ allowedTags, setAllowedTags ] = useState<string[]>([]);
    const [ blockedTags, setBlockedTags ] = useState<string[]>([]);
    const libraryMenu = useMemo(async () => ((await import('../../../../scripts/libraryMenu')).default), []);

    const element = useRef<HTMLDivElement>(null);

    const populateRatings = useCallback((allParentalRatings: ParentalRating[]) => {
        let rating;
        const ratings: ParentalRating[] = [];

        for (let i = 0, length = allParentalRatings.length; i < length; i++) {
            rating = allParentalRatings[i];

            if (ratings.length) {
                const lastRating = ratings[ratings.length - 1];

                if (lastRating.Value === rating.Value) {
                    lastRating.Name += '/' + rating.Name;
                    continue;
                }
            }

            ratings.push({
                Name: rating.Name,
                Value: rating.Value
            });
        }

        setParentalRatings(ratings);
    }, []);

    const loadUnratedItems = useCallback((user: UserDto) => {
        const page = element.current;

        if (!page) {
            console.error('[userparentalcontrol] Unexpected null page reference');
            return;
        }

        const items: NamedItem[] = [{
            name: globalize.translate('Books'),
            value: UnratedItem.Book
        }, {
            name: globalize.translate('Channels'),
            value: UnratedItem.ChannelContent
        }, {
            name: globalize.translate('LiveTV'),
            value: UnratedItem.LiveTvChannel
        }, {
            name: globalize.translate('Movies'),
            value: UnratedItem.Movie
        }, {
            name: globalize.translate('Music'),
            value: UnratedItem.Music
        }, {
            name: globalize.translate('Trailers'),
            value: UnratedItem.Trailer
        }, {
            name: globalize.translate('Shows'),
            value: UnratedItem.Series
        }];

        const unratedNamedItem: UnratedNamedItem[] = [];

        for (const item of items) {
            const isChecked = user.Policy?.BlockUnratedItems?.indexOf(item.value) != -1;
            const checkedAttribute = isChecked ? ' checked="checked"' : '';
            unratedNamedItem.push({
                value: item.value,
                name: item.name,
                checkedAttribute: checkedAttribute
            });
        }

        setUnratedItems(unratedNamedItem);

        const blockUnratedItems = page.querySelector('.blockUnratedItems') as HTMLDivElement;
        blockUnratedItems.dispatchEvent(new CustomEvent('create'));
    }, []);

    const loadUser = useCallback((user: UserDto, allParentalRatings: ParentalRating[]) => {
        const page = element.current;

        if (!page) {
            console.error('[userparentalcontrol] Unexpected null page reference');
            return;
        }

        setUserName(user.Name || '');
        void libraryMenu.then(menu => menu.setTitle(user.Name));
        loadUnratedItems(user);

        setAllowedTags(user.Policy?.AllowedTags || []);
        setBlockedTags(user.Policy?.BlockedTags || []);
        populateRatings(allParentalRatings);

        let ratingValue = '';
        allParentalRatings.forEach(rating => {
            if (rating.Value != null && user.Policy?.MaxParentalRating != null && user.Policy.MaxParentalRating >= rating.Value) {
                ratingValue = `${rating.Value}`;
            }
        });

        setMaxParentalRating(ratingValue);

        if (user.Policy?.IsAdministrator) {
            (page.querySelector('.accessScheduleSection') as HTMLDivElement).classList.add('hide');
        } else {
            (page.querySelector('.accessScheduleSection') as HTMLDivElement).classList.remove('hide');
        }
        setAccessSchedules(user.Policy?.AccessSchedules || []);
        loading.hide();
    }, [libraryMenu, setAllowedTags, setBlockedTags, loadUnratedItems, populateRatings]);

    const loadData = useCallback(() => {
        if (!userId) {
            console.error('[userparentalcontrol.loadData] missing user id');
            return;
        }

        loading.show();
        const promise1 = window.ApiClient.getUser(userId);
        const promise2 = window.ApiClient.getParentalRatings();
        Promise.all([promise1, promise2]).then(function (responses) {
            loadUser(responses[0], responses[1]);
        }).catch(err => {
            console.error('[userparentalcontrol] failed to load data', err);
        });
    }, [loadUser, userId]);

    useEffect(() => {
        const page = element.current;

        if (!page) {
            console.error('[userparentalcontrol] Unexpected null page reference');
            return;
        }

        loadData();

        const showSchedulePopup = (schedule: AccessSchedule, index: number) => {
            schedule = schedule || {};
            import('../../../../components/accessSchedule/accessSchedule').then(({ default: accessschedule }) => {
                accessschedule.show({
                    schedule: schedule
                }).then(function (updatedSchedule) {
                    const schedules = getSchedulesFromPage();

                    if (index == -1) {
                        index = schedules.length;
                    }

                    schedules[index] = updatedSchedule;
                    setAccessSchedules(schedules);
                }).catch(() => {
                    // access schedule closed
                });
            }).catch(err => {
                console.error('[userparentalcontrol] failed to load access schedule', err);
            });
        };

        const getSchedulesFromPage = () => {
            return Array.prototype.map.call(page.querySelectorAll('.liSchedule'), function (elem) {
                return {
                    DayOfWeek: elem.getAttribute('data-day'),
                    StartHour: elem.getAttribute('data-start'),
                    EndHour: elem.getAttribute('data-end')
                };
            }) as AccessSchedule[];
        };

        const getAllowedTagsFromPage = () => {
            return Array.prototype.map.call(page.querySelectorAll('.allowedTag'), function (elem) {
                return elem.getAttribute('data-tag');
            }) as string[];
        };

        const showAllowedTagPopup = () => {
            prompt({
                label: globalize.translate('LabelTag')
            }).then(function (value) {
                const tags = getAllowedTagsFromPage();

                if (tags.indexOf(value) == -1) {
                    tags.push(value);
                    setAllowedTags(tags);
                }
            }).catch(() => {
                // prompt closed
            });
        };

        const getBlockedTagsFromPage = () => {
            return Array.prototype.map.call(page.querySelectorAll('.blockedTag'), function (elem) {
                return elem.getAttribute('data-tag');
            }) as string[];
        };

        const showBlockedTagPopup = () => {
            prompt({
                label: globalize.translate('LabelTag')
            }).then(function (value) {
                const tags = getBlockedTagsFromPage();

                if (tags.indexOf(value) == -1) {
                    tags.push(value);
                    setBlockedTags(tags);
                }
            }).catch(() => {
                // prompt closed
            });
        };

        const onSaveComplete = () => {
            loading.hide();
            toast(globalize.translate('SettingsSaved'));
        };

        const saveUser = handleSaveUser(page, getSchedulesFromPage, getAllowedTagsFromPage, getBlockedTagsFromPage, onSaveComplete);

        const onSubmit = (e: Event) => {
            if (!userId) {
                console.error('[userparentalcontrol.onSubmit] missing user id');
                return;
            }

            loading.show();
            window.ApiClient.getUser(userId).then(function (result) {
                saveUser(result);
            }).catch(err => {
                console.error('[userparentalcontrol] failed to fetch user', err);
            });
            e.preventDefault();
            e.stopPropagation();
            return false;
        };

        // The following is still hacky and should migrate to pure react implementation for callbacks in the future
        const accessSchedulesPopupCallback = function () {
            showSchedulePopup({
                Id: 0,
                UserId: '',
                DayOfWeek: DynamicDayOfWeek.Sunday,
                StartHour: 0,
                EndHour: 0
            }, -1);
        };
        (page.querySelector('#btnAddSchedule') as HTMLButtonElement).addEventListener('click', accessSchedulesPopupCallback);
        (page.querySelector('#btnAddAllowedTag') as HTMLButtonElement).addEventListener('click', showAllowedTagPopup);
        (page.querySelector('#btnAddBlockedTag') as HTMLButtonElement).addEventListener('click', showBlockedTagPopup);
        (page.querySelector('.userParentalControlForm') as HTMLFormElement).addEventListener('submit', onSubmit);

        return () => {
            (page.querySelector('#btnAddSchedule') as HTMLButtonElement).removeEventListener('click', accessSchedulesPopupCallback);
            (page.querySelector('#btnAddAllowedTag') as HTMLButtonElement).removeEventListener('click', showAllowedTagPopup);
            (page.querySelector('#btnAddBlockedTag') as HTMLButtonElement).removeEventListener('click', showBlockedTagPopup);
            (page.querySelector('.userParentalControlForm') as HTMLFormElement).removeEventListener('submit', onSubmit);
        };
    }, [setAllowedTags, setBlockedTags, loadData, userId]);

    useEffect(() => {
        const page = element.current;

        if (!page) {
            console.error('[userparentalcontrol] Unexpected null page reference');
            return;
        }

        (page.querySelector('#selectMaxParentalRating') as HTMLSelectElement).value = String(maxParentalRating);
    }, [maxParentalRating, parentalRatings]);

    const optionMaxParentalRating = () => {
        let content = '';
        content += '<option value=\'\'></option>';
        for (const rating of parentalRatings) {
            if (rating.Value != null) {
                content += `<option value='${rating.Value}'>${escapeHTML(rating.Name)}</option>`;
            }
        }
        return content;
    };

    const removeAllowedTagsCallback = useCallback((tag: string) => {
        const newTags = allowedTags.filter(t => t !== tag);
        setAllowedTags(newTags);
    }, [allowedTags, setAllowedTags]);

    const removeBlockedTagsTagsCallback = useCallback((tag: string) => {
        const newTags = blockedTags.filter(t => t !== tag);
        setBlockedTags(newTags);
    }, [blockedTags, setBlockedTags]);

    const removeScheduleCallback = useCallback((index: number) => {
        const newSchedules = accessSchedules.filter((_e, i) => i != index);
        setAccessSchedules(newSchedules);
    }, [accessSchedules, setAccessSchedules]);

    return (
        <Page
            id='userParentalControlPage'
            className='mainAnimatedPage type-interior'
        >
            <div ref={element} className='content-primary'>
                <div className='verticalSection'>
                    <SectionTitleContainer
                        title={userName}
                    />
                </div>
                <SectionTabs activeTab='userparentalcontrol'/>
                <form className='userParentalControlForm'>
                    <div className='selectContainer'>
                        <SelectElement
                            id='selectMaxParentalRating'
                            label='LabelMaxParentalRating'
                        >
                            {optionMaxParentalRating()}
                        </SelectElement>
                        <div className='fieldDescription'>
                            {globalize.translate('MaxParentalRatingHelp')}
                        </div>
                    </div>
                    <div>
                        <div className='blockUnratedItems'>
                            <h3 className='checkboxListLabel'>
                                {globalize.translate('HeaderBlockItemsWithNoRating')}
                            </h3>
                            <div className='checkboxList paperList' style={{ padding: '.5em 1em' }}>
                                {unratedItems.map(Item => {
                                    return <CheckBoxElement
                                        key={Item.value}
                                        className='chkUnratedItem'
                                        itemType={Item.value}
                                        itemName={Item.name}
                                        itemCheckedAttribute={Item.checkedAttribute}
                                    />;
                                })}
                            </div>
                        </div>
                    </div>
                    <br />
                    <div className='verticalSection' style={{ marginBottom: '2em' }}>
                        <SectionTitleContainer
                            SectionClassName='detailSectionHeader'
                            title={globalize.translate('LabelAllowContentWithTags')}
                            isBtnVisible={true}
                            btnId='btnAddAllowedTag'
                            btnClassName='fab submit sectionTitleButton'
                            btnTitle='Add'
                            btnIcon='add'
                        />
                        <div className='fieldDescription'>
                            {globalize.translate('AllowContentWithTagsHelp')}
                        </div>
                        <div className='allowedTags' style={{ marginTop: '.5em' }}>
                            {allowedTags?.map(tag => {
                                return <TagList
                                    key={tag}
                                    tag={tag}
                                    tagType='allowedTag'
                                    removeTagCallback={removeAllowedTagsCallback}
                                />;
                            })}
                        </div>
                    </div>
                    <div className='verticalSection' style={{ marginBottom: '2em' }}>
                        <SectionTitleContainer
                            SectionClassName='detailSectionHeader'
                            title={globalize.translate('LabelBlockContentWithTags')}
                            isBtnVisible={true}
                            btnId='btnAddBlockedTag'
                            btnClassName='fab submit sectionTitleButton'
                            btnTitle='Add'
                            btnIcon='add'
                        />
                        <div className='fieldDescription'>
                            {globalize.translate('BlockContentWithTagsHelp')}
                        </div>
                        <div className='blockedTags' style={{ marginTop: '.5em' }}>
                            {blockedTags.map(tag => {
                                return <TagList
                                    key={tag}
                                    tag={tag}
                                    tagType='blockedTag'
                                    removeTagCallback={removeBlockedTagsTagsCallback}
                                />;
                            })}
                        </div>
                    </div>
                    <div className='accessScheduleSection verticalSection' style={{ marginBottom: '2em' }}>
                        <SectionTitleContainer
                            title={globalize.translate('HeaderAccessSchedule')}
                            isBtnVisible={true}
                            btnId='btnAddSchedule'
                            btnClassName='fab submit sectionTitleButton'
                            btnTitle='Add'
                            btnIcon='add'
                        />
                        <p>{globalize.translate('HeaderAccessScheduleHelp')}</p>
                        <div className='accessScheduleList paperList'>
                            {accessSchedules.map((accessSchedule, index) => {
                                return <AccessScheduleList
                                    key={`${accessSchedule.DayOfWeek}${accessSchedule.StartHour}${accessSchedule.EndHour}`}
                                    index={index}
                                    DayOfWeek={accessSchedule.DayOfWeek}
                                    StartHour={accessSchedule.StartHour}
                                    EndHour={accessSchedule.EndHour}
                                    removeScheduleCallback={removeScheduleCallback}
                                />;
                            })}
                        </div>
                    </div>
                    <div>
                        <Button
                            type='submit'
                            className='raised button-submit block'
                            title={globalize.translate('Save')}
                        />
                    </div>
                </form>
            </div>
        </Page>

    );
};

export default UserParentalControl;
